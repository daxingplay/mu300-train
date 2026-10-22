# mu300-train

**为运行 [mu300-linux](https://github.com/dikeckaan/mu300-linux) OpenWrt 的中兴 F50（MU300）提供高铁模式。**

[English](README.md)

中兴 F50 Pro 的固件带有“高铁模式”，F50 没有，mu300-linux 的 OpenWrt 也没有。这个附加组件把同样的功能带到 OpenWrt 上：

- **调制解调器高铁优化**：开启紫光展锐（Unisoc）调制解调器自带的高铁优化，也就是原厂 Android 固件中工程模式（EngineerMode）里的那个开关。
- **快速重连**：调制解调器一报告数据连接断开或重新找到网络，就立即重新拨号，另有每 15 秒一次的备用检查（可设置）。mu300-linux 自带的看门狗每 30 秒检查一次，并且要连续两次失败才会重拨。
- **快速 AT**：让 mu300-linux 的 AT 守护进程运行在能按小数秒等待的 shell 下，每条 AT 命令快约 8 倍（1.04 秒 → 0.13 秒）。断线后剩下的等待时间大多花在这里。默认开启。
- **仅 4G（可选）**：在 5G 频繁掉线的线路上避免反复切换 5G 小区。
- **LuCI 页面**：位于“蜂窝 → 高铁模式”，支持英文和简体中文。

它是独立的附加组件：不修改 mu300-linux 的程序，mu300-linux 升级后也能继续工作。它在自身文件之外唯一的改动，是快速 AT 修改 mu300-linux 两个启动脚本中的启动命令行（见下文）。

## 实测

测试方法：在调制解调器保持注册的情况下断开数据连接（`AT+CGACT=0,1`），这正是高铁上切换小区或过隧道后常见的情况。

| | 数据恢复用时 |
|---|---|
| 仅 mu300-linux 看门狗 | 68 秒 |
| mu300-train 初版（每 5 秒轮询，未发布） | 13–17 秒（4 次） |
| mu300-train v0.1.0（响应调制解调器的事件报告） | 11.7–13.8 秒（5 次） |
| mu300-train + 快速 AT | **2.7–3.8 秒**（5 次） |

不开快速 AT 时，断线会在约 2 秒内被发现并开始重拨，剩下的时间花在 mu300-linux 自身的拨号上：大约十条 AT 命令，每条约 1 秒。快速 AT 把这次拨号缩短到约 2 秒。

快速重连是在室内测得的。高铁优化本身（时速 300 公里下的多普勒处理）只能在真实的列车上检验，欢迎反馈。

## 要求

- 运行 mu300-linux **OpenWrt**（`openwrt` 或 `openwrt-luci`）的中兴 F50 / MU300。不适用于 Ubuntu 或 Arch 镜像。
- 测试环境：mu300-linux v2026.10.15、内核 5.4、OpenWrt 25.12.5、中国电信 5G SA。U30 Air 应该也能用，但未测试。
- 能以 root 身份 SSH 登录（默认通过 USB：`ssh root@192.168.77.1`）。

## 安装

在连接着设备的电脑上运行（需要 `ssh` 和 `tar`，Windows 10 及以上、macOS 和 Linux 都自带）：

```sh
git clone https://github.com/daxingplay/mu300-train
cd mu300-train
./install.sh root@192.168.77.1
```

也可以把仓库复制到设备上，直接在设备上运行 `./install.sh`。重复运行即可原地升级，设置会保留。

安装后高铁模式默认**关闭**。用 `mu300-train on` 或在 LuCI 中开启。

## 使用

```sh
mu300-train on          # 开启高铁模式：高铁优化 + 快速重连（如已选择，再加仅 4G）
mu300-train off         # 全部恢复原状
mu300-train lte on|off  # 高铁模式开启时仅用 4G（默认关）
mu300-train hsr on|off  # 高铁模式开启时启用调制解调器高铁优化（默认开）
mu300-train interval 15 # 备用检查间隔：5、10、15、30 或 60 秒（默认 15，立即生效）
mu300-train fast-at on|off # 快速 AT（默认开；与高铁模式是否开启无关）
mu300-train status 30   # 状态 + 最近 30 条事件
```

开关高铁模式或修改选项都会重启射频，移动数据会中断 15–40 秒。

旅行结束后，`mu300-train status 50` 会列出每一次掉线、重拨以及断网时长。事件保存在 `/etc/mu300/train/events.log`（最多 256 KB），因为这台设备的系统日志只能保留大约 90 秒。

## 工作原理

**高铁优化**：原厂固件中的紫光展锐工程模式（`com.unisoc.engineermode … highspeedrail.HighSpeedRailImpl`）使用：

```
AT+SP5GCMDS="set nr param",35,1     # 开（0 = 关）
AT+SP5GCMDS="get nr synch_param",44 # 读取：第 4 个字段即当前值
```

这是 NR（5G）参数，对 4G 不起作用。调制解调器在射频重启和设备重启后都会保留这个值。mu300-train 通过 mu300-linux 的 `mu300-at` 发送命令，从不直接打开调制解调器的 AT 端口。

**快速重连**：调制解调器会在其主动上报通道上报告状态变化，mu300-linux 把这些报告记录在 `/run/mu300-at/urc/stty_nr0.log`。mu300-train 跟踪这个日志：收到 `+CGEV: NW PDN DEACT 1` / `ME PDN DEACT 1`（数据上下文断开）时，如果调制解调器已注册就立即重拨；中断后再次收到表示已注册的 `+CEREG` 时立即检查一次，因为这正是拨号能成功的时刻。每 15 秒一次的备用检查用于发现不会被报告的情况：调制解调器停止响应、漏掉的报告、以新地址重新附着等。它会检查数据上下文是否激活、`sipa_eth0` 上的地址是否与当前上下文一致。断网期间每 2 秒检查一次。

每次检查都会发送两三条 AT 命令，AT 通道的其他用户（LuCI 状态页、短信）需要排队等待，因此备用检查不宜太频繁：有了事件报告，它只需处理少数情况。

重拨方式是 `ifup wan`，与自带看门狗走同一条拨号路径。在另一次拨号进行中、手动关闭了移动数据，或 mu300-power 让调制解调器休眠时，它都不会拨号。连续拨号失败时会逐步退避（10、20、40、60 秒）。自带看门狗在下层继续运行。

**快速 AT**：mu300-linux 的 AT 守护进程（`mu300-atd`）在每条命令前都会等待残留的输出：shell 支持小数秒时等 0.1 秒，不支持时等整整 1 秒。OpenWrt 的 busybox `ash` 不支持（`read: invalid timeout`），所以每条 AT 命令都要约 1 秒。mu300-linux 自带在 `/opt/mu300/bin` 中的静态 busybox 支持。快速 AT 把 `/etc/init.d/mu300-atd`（通用和移动数据通道）和 `/etc/init.d/mu300-atd-dash`（LuCI 状态页的通道）中守护进程的启动命令改为 `/opt/mu300/bin/busybox ash /opt/mu300/bin/mu300-atd`，并在数据连接建立后重启这些守护进程。脚本中的其他内容不变，`fast-at off` 或 `uninstall` 会恢复原来的启动命令。mu300-linux 升级会替换这些脚本，因此 mu300-train 每次开机都会重新应用。实测：在两个通道上同时发送 200 条命令，没有一条回复错位。详见 [#4](https://github.com/daxingplay/mu300-train/issues/4)；真正的修复应在 mu300-linux 中完成。

**仅 4G** 通过 mu300-linux 自带的网络锁定设置（`/usr/libexec/unisoc-modem/lock apply mode 4g`），因此“蜂窝 → 网络锁定”中会显示它，重启后也会保留。关闭仅 4G 或高铁模式时会恢复之前的网络模式；如果期间你手动改过网络锁定，则保留你的设置。

## 设备上的文件

| 路径 | 内容 |
|---|---|
| `/etc/mu300/train/` | 脚本、LuCI 源文件、`events.log` |
| `/etc/config/mu300train` | 设置（`enabled`、`hsr`、`lte_only`、备用检查间隔 `interval`） |
| `/etc/rc.local` | 一行，运行 `mu300-train boot` |
| `/etc/init.d/mu300-atd`、`/etc/init.d/mu300-atd-dash` | 快速 AT：守护进程的启动命令行（mu300-linux 的文件） |
| `/usr/bin/mu300-train` | 指向脚本的链接 |
| `/www/luci-static/resources/view/mu300/train.js`、`/usr/share/luci/menu.d/luci-app-mu300-train.json`、`/usr/share/rpcd/acl.d/luci-app-mu300-train.json`、`/usr/libexec/rpcd/mu300train`、`/usr/lib/lua/luci/i18n/mu300train.zh-cn.lmo` | LuCI 页面 |

mu300-linux 升级时只保留 `/etc/config`、`/etc/mu300`、`/etc/rc.local`、`/etc/dropbear` 和 `/root`。因此所有文件都放在这些位置，每次开机时 `mu300-train boot` 会把链接、LuCI 文件和快速 AT 放回原处。

## 卸载

```sh
mu300-train uninstall      # 关闭高铁模式和快速 AT，移除 LuCI 页面、链接、配置和 rc.local 中的那一行
rm -rf /etc/mu300/train    # 删除文件本身
```

## 翻译

翻译文件是 `luci/po/zh_Hans/mu300train.po`。修改后用 mu300-linux 的 `tools/po2lmo.py` 重新生成 `luci/mu300train.zh-cn.lmo`：

```sh
python3 path/to/mu300-linux/tools/po2lmo.py luci/po/zh_Hans/mu300train.po luci/mu300train.zh-cn.lmo
```

## 致谢

- dikeckaan 的 [mu300-linux](https://github.com/dikeckaan/mu300-linux)：本项目建立在它之上，用到了它的 AT 守护进程、拨号路径、网络锁定、LuCI 面板样式和 `po2lmo.py`。
- 高铁优化命令来自 F50 原厂固件中的紫光展锐工程模式。

## 许可证

MIT
