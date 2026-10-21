# mu300-train

**High-speed train mode for the ZTE F50 (MU300) running [mu300-linux](https://github.com/dikeckaan/mu300-linux) OpenWrt.**

[简体中文](README.zh-CN.md)

ZTE's F50 Pro firmware has a "high-speed train mode" (高铁模式). The F50 doesn't, and mu300-linux's OpenWrt doesn't
either. This add-on brings the same idea to OpenWrt:

- **Modem HSR setting:** turns on the Unisoc modem's own high-speed-rail optimisation, the switch Unisoc's EngineerMode
  app offers in the stock Android firmware.
- **Fast reconnect:** checks the mobile data connection every 5 s and redials as soon as the modem is registered again.
  The stock mu300-linux watchdog checks every 30 s and waits for two failures before it redials.
- **4G only (optional):** avoids constant 5G handovers on routes where 5G keeps dropping.
- **LuCI page** at *Cellular → Train mode*, in English and Simplified Chinese.

It is a standalone add-on: mu300-linux itself is not patched, and an mu300-linux update keeps it working.

## Measured

The test: drop the data connection while the modem stays registered (`AT+CGACT=0,1`), the usual case on a train after
a handover or a tunnel.

| | Data back after |
|---|---|
| mu300-linux watchdog only | 68 s |
| with mu300-train | 13–17 s (4 runs) |

The fast reconnect was measured on a desk. The HSR setting itself (Doppler handling at 300 km/h) can only be judged
on a real train; reports are welcome.

## Requirements

- A ZTE F50 / MU300 running mu300-linux **OpenWrt** (`openwrt` or `openwrt-luci`). Not for the Ubuntu or Arch images.
- Tested on mu300-linux v2026.10.15, kernel 5.4, OpenWrt 25.12.5, on China Telecom 5G SA. The U30 Air should work but
  is untested.
- SSH access as root (by default `ssh root@192.168.77.1` over USB).

## Install

From a computer connected to the device (needs `ssh` and `tar`, which Windows 10+, macOS and Linux all have):

```sh
git clone https://github.com/daxingplay/mu300-train
cd mu300-train
./install.sh root@192.168.77.1
```

Or copy the repository onto the device and run `./install.sh` there. Running it again upgrades in place and keeps
your settings.

Train mode is **off** after installing. Turn it on with `mu300-train on` or in LuCI.

## Usage

```sh
mu300-train on          # train mode on: HSR + fast reconnect (+ 4G only, if chosen)
mu300-train off         # everything back as it was
mu300-train lte on|off  # 4G only while train mode is on (default off)
mu300-train hsr on|off  # the modem HSR setting while train mode is on (default on)
mu300-train status 30   # state + the last 30 events
```

Turning train mode on or off, or changing an option, restarts the radio: mobile data stops for 15–40 s.

After a trip, `mu300-train status 50` shows every drop, redial and how long the data was gone. The events are kept
in `/etc/mu300/train/events.log` (at most 256 KB) because the system log on this device holds only about 90 seconds.

## How it works

**HSR.** The stock firmware's Unisoc EngineerMode (`com.unisoc.engineermode … highspeedrail.HighSpeedRailImpl`) uses:

```
AT+SP5GCMDS="set nr param",35,1     # on (0 = off)
AT+SP5GCMDS="get nr synch_param",44 # read back: the 4th field is the value
```

It is an NR (5G) parameter, so it does nothing on 4G. The modem keeps the value across radio restarts and reboots.
mu300-train sends it through mu300-linux's `mu300-at`, never by opening the modem's AT port directly.

**Fast reconnect.** A loop checks every 5 s that the data context is active and that `sipa_eth0` carries the
context's current address. When it isn't, and the modem is registered, it runs `ifup wan`, the same dial path the
stock watchdog uses. It never dials while another dial is running, while mobile data is switched off by hand or while
mu300-power holds the modem down. It backs off (10, 20, 40, 60 s) when dials keep failing. The stock watchdog keeps
running underneath.

**4G only** is set through mu300-linux's own network lock (`/usr/libexec/unisoc-modem/lock apply mode 4g`), so
*Cellular → Network locks* shows it and it survives reboots. The previous mode is remembered and restored when 4G only
or train mode goes off, unless you changed the network lock by hand in the meantime.

## Files on the device

| Path | What |
|---|---|
| `/etc/mu300/train/` | the script, the LuCI sources, `events.log` |
| `/etc/config/mu300train` | settings (`enabled`, `hsr`, `lte_only`, `interval`) |
| `/etc/rc.local` | one line that runs `mu300-train boot` |
| `/usr/bin/mu300-train` | link to the script |
| `/www/luci-static/resources/view/mu300/train.js`, `/usr/share/luci/menu.d/luci-app-mu300-train.json`, `/usr/share/rpcd/acl.d/luci-app-mu300-train.json`, `/usr/libexec/rpcd/mu300train`, `/usr/lib/lua/luci/i18n/mu300train.zh-cn.lmo` | the LuCI page |

An mu300-linux update keeps only `/etc/config`, `/etc/mu300`, `/etc/rc.local`, `/etc/dropbear` and `/root`. So
everything lives in those, and at every boot `mu300-train boot` puts the link and the LuCI files back in place.

## Uninstall

```sh
mu300-train uninstall      # train mode off, LuCI page, link, config and rc.local line removed
rm -rf /etc/mu300/train    # the files themselves
```

## Translations

The catalog is `luci/po/zh_Hans/mu300train.po`. Rebuild `luci/mu300train.zh-cn.lmo` after editing it with
mu300-linux's `tools/po2lmo.py`:

```sh
python3 path/to/mu300-linux/tools/po2lmo.py luci/po/zh_Hans/mu300train.po luci/mu300train.zh-cn.lmo
```

## Credits

- [mu300-linux](https://github.com/dikeckaan/mu300-linux) by dikeckaan, which this builds on: its AT daemon,
  dial path, network locks, LuCI panel style and `po2lmo.py`.
- The HSR command comes from Unisoc's EngineerMode in the stock F50 firmware.

## License

MIT
