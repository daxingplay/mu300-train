#!/bin/sh
# Install or upgrade mu300-train on a device running mu300-linux OpenWrt.
#   ./install.sh                     on the device itself (run from a copy of this repository)
#   ./install.sh root@192.168.77.1   from a computer: copies the files over SSH and installs them
# An upgrade keeps the settings (/etc/config/mu300train) and the event log. Nothing on the device outside
# /etc/mu300/train, /etc/config/mu300train, /etc/rc.local and the LuCI/rpcd files listed in the README is touched.
set -eu
cd "$(dirname "$0")"
DEST=/etc/mu300/train
FILES="mu300-train luci/train.js luci/menu.json luci/acl.json luci/rpcd luci/mu300train.zh-cn.lmo"

for f in $FILES; do
    [ -f "$f" ] || { echo "missing $f: run this from a complete copy of the repository" >&2; exit 1; }
done

# the device side, fed a tar of $FILES on stdin
REMOTE="set -e
mkdir -p $DEST
tar xzf - -C $DEST
chown -R root:root $DEST
chmod 755 $DEST/mu300-train $DEST/luci/rpcd
chmod 644 $DEST/luci/train.js $DEST/luci/menu.json $DEST/luci/acl.json $DEST/luci/mu300train.zh-cn.lmo
$DEST/mu300-train install"

if [ $# -eq 0 ]; then
    [ -e /etc/openwrt_release ] && [ -d /opt/mu300 ] || {
        echo "this is not mu300-linux OpenWrt; to install from a computer: $0 root@192.168.77.1" >&2
        exit 1
    }
    tar czf - $FILES | sh -c "$REMOTE"
else
    # Dropbear has no SFTP server by default, so the files go through ssh's stdin
    tar czf - $FILES | ssh "$1" "$REMOTE"
fi
echo "done. Turn it on with 'mu300-train on' or in LuCI: Cellular > Train mode"
