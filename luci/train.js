'use strict';
'require view';
'require dom';
'require rpc';
'require poll';
'require mu300.common as M';

/* Every value from the backend goes into E() inside an array: LuCI's E() takes a lone string as HTML, an array's
 * strings as text. */
/* Cellular > Train mode: the mu300-train add-on (/etc/mu300/train). The backend is the rpcd plugin mu300train:
 * get -> `mu300-train json`, set {key, value} -> `mu300-train ui KEY VALUE`, which saves the setting and applies it
 * in the background (a radio restart takes 15-40 s, longer than an rpc call should wait). While that runs the state
 * says busy and the page polls every 2 s. */
var callGet = rpc.declare({ object: 'mu300train', method: 'get', expect: { '': {} } });
var callSet = rpc.declare({ object: 'mu300train', method: 'set', params: [ 'key', 'value' ], expect: { '': {} } });

var MODES = { 'auto': _('Automatic'), '4g': _('4G only'), 'sa': _('5G SA only'), 'nsa': _('5G NSA') };

return view.extend({
	load: function() { return L.resolveDefault(callGet(), {}); },

	render: function(state) {
		var self = this;
		M.injectCss();
		this.root = E('div', { 'class': 'mud' });
		this.paint(state || {});
		poll.add(function() { return self.busy ? null : self.reload(); }, 10);
		return this.root;
	},

	reload: function() {
		var self = this;
		return L.resolveDefault(callGet(), {}).then(function(st) {
			self.paint(st || {});
			/* a change is being applied: follow it closely until it is done */
			if (st && st.busy && !self.timer)
				self.timer = setTimeout(function() { self.timer = null; self.reload(); }, 2000);
			return st;
		});
	},

	/* value: true/false for the switches, a number of seconds for the interval */
	set: function(btn, key, value) {
		var self = this;
		if (btn) M.busy(btn, true);
		return callSet(key, typeof value === 'number' ? String(value) : value ? '1' : '0').then(function(r) {
			if (btn) M.busy(btn, false);
			if (!r || r.ok !== 1) {
				M.toast(_('Failed: %s').format(M.errText(r)), { type: 'error', timeout: 6000 });
				return self.reload();
			}
			M.toast(key === 'interval' ? _('Saved') : _('Saved, applying...'), { type: 'success' });
			/* the background sync takes its lock a moment after the answer */
			setTimeout(function() { self.reload(); }, 800);
		}, function() {
			if (btn) M.busy(btn, false);
			M.toast(_('Management connection lost'), { type: 'error', timeout: 6000 });
		});
	},

	row: function(k, v) {
		return E('div', { 'class': 'mud-r' }, [ E('span', { 'class': 'mud-k' }, [ k ]), E('span', { 'class': 'mud-v' }, [ v ]) ]);
	},

	/* an on/off select for an option; it only matters while train mode is on */
	option: function(key, current, id, disabled) {
		var self = this;
		var sel = E('select', { 'class': 'cbi-input-select', 'id': id, 'disabled': disabled ? '' : null }, [
			E('option', { 'value': '1' }, [ _('On') ]),
			E('option', { 'value': '0' }, [ _('Off') ])
		]);
		sel.value = current ? '1' : '0';
		sel.addEventListener('change', function() { self.set(null, key, sel.value === '1'); });
		return sel;
	},

	/* the backup check's interval: the loop takes a new value at its next check, no radio restart */
	interval: function(current) {
		var self = this;
		var sel = E('select', { 'class': 'cbi-input-select', 'id': 'mud-train-interval' }, [ 5, 10, 15, 30, 60 ].map(function(n) {
			return E('option', { 'value': String(n) }, [ _('Every %d s').format(n) ]);
		}));
		sel.value = String(current);
		sel.addEventListener('change', function() { self.set(null, 'interval', +sel.value); });
		return sel;
	},

	paint: function(st) {
		var self = this;
		this.busy = !!st.busy;
		var on = !!st.enabled;
		var dash = '--';

		var state = st.busy ? _('Applying a change...') : on ? _('On') : _('Off');
		var hsr = st.busy ? dash : st.modem_hsr === '1' ? _('On') : st.modem_hsr === '0' ? _('Off') : _('No answer');
		var mode = st.busy ? dash : (MODES[st.mode] || st.mode || _('No answer'));
		if (st.mode_owned && st.prev_mode)
			mode += ' ' + _('(set by train mode, was %s)').format(MODES[st.prev_mode] || st.prev_mode);
		var loop = st.loop ? _('Running: reacts to the modem at once, backup check every %d s').format(st.interval || 15) : _('Not running');

		var main = E('button', { 'class': 'mud-btn' + (on ? ' warn' : ''), 'id': 'mud-train-toggle',
			'disabled': st.busy ? '' : null }, [ on ? _('Turn train mode off') : _('Turn train mode on') ]);
		main.addEventListener('click', function() { self.set(main, 'enabled', !on); });

		var card = E('section', { 'class': 'mud-card', 'id': 'mud-train' }, [
			E('h3', {}, _('High-speed train mode')),
			E('div', { 'class': 'mud-note' },
				_('For fast trains: turns on the modem\'s high-speed-rail setting (5G) and a reconnect check every few seconds, so mobile data comes back as soon as the modem finds the network again instead of after a minute or more. Switching restarts the radio, so data stops for 15-40 s.')),
			this.row(_('Train mode'), state),
			this.row(_('Modem HSR setting'), hsr),
			this.row(_('Network mode'), mode),
			this.row(_('Fast reconnect'), loop),
			E('div', { 'style': 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0' }, [ main ])
		]);

		var opts = E('section', { 'class': 'mud-card', 'id': 'mud-train-opts' }, [
			E('h3', {}, _('Options')),
			E('div', { 'class': 'mud-note' }, _('These apply while train mode is on.')),
			this.row(_('High-speed-rail setting (5G)'), this.option('hsr', st.hsr, 'mud-train-hsr', st.busy)),
			this.row(_('4G only'), this.option('lte_only', st.lte_only, 'mud-train-lte', st.busy)),
			this.row(_('Backup check'), this.interval(st.interval || 15)),
			E('div', { 'class': 'mud-note' },
				_('4G only avoids constant 5G handovers on routes where 5G keeps dropping. It uses the Network locks setting and puts back the previous mode when it is turned off.')),
			E('div', { 'class': 'mud-note' },
				_('A dropped connection is redialled the moment the modem announces it. The backup check catches what is never announced, such as a modem that stopped answering. Each check sends a few AT commands that other pages have to wait for, so shorter is not better.'))
		]);

		var ev = (st.events || []).slice().reverse();
		var log = E('section', { 'class': 'mud-card', 'id': 'mud-train-log' }, [
			E('h3', {}, _('Recent events')),
			ev.length ? E('pre', { 'style': 'white-space:pre-wrap;font-size:12px;margin:0;max-height:24em;overflow:auto' }, [ ev.join('\n') ])
				: E('div', { 'class': 'mud-note' }, _('Nothing yet'))
		]);

		dom.content(this.root, [ card, opts, log ]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
