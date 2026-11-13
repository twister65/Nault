# Nault

![GitHub release (latest by date)](https://img.shields.io/github/v/release/twister65/Nault)
[![GitHub All Releases](https://img.shields.io/github/downloads/twister65/Nault/total)](https://github.com/twister65/Nault/releases/latest).

This fork aims to improve Nault's stability, security, and portability across operating systems and Nano/RsNano nodes. It also maintains and tests hardware wallet compatibility with Ledger Nano S Plus and Nano X devices.

It's a fully client-side signing wallet for sending and receiving [nano](https://github.com/nanocurrency/nano-node/) either directly in your browser at [twister32.changeip.org](https://twister32.changeip.org/) or with the [desktop app](https://github.com/twister65/Nault/releases/latest).

Seamless integration with any nano compatible RPC backend/websocket and the aim to be more frequently maintained are some of the main features. Those together will greatly increase the stability, performance and uptime.

![Nault Screenshot](/src/assets/img/preview.png)
___

## Optional third-party Nano.to PoW API

This fork can use a user-provided Nano.to API key to request Nano proof of work.
The integration is optional and **compatible with Nault's MIT license**;
[Nano.to](https://rpc.nano.to/) is an independent third-party service and
has its own [privacy policy](https://rpc.nano.to/privacy) and
[terms of service](https://rpc.nano.to/terms).
Keys are encrypted locally in a separate WebCrypto vault and are decrypted only
after explicit unlock. An unlocked Nano.to key is transmitted **only** in the
HTTPS Authorization header for `work_generate` requests to
`https://rpc.nano.to/` — never as part of a wallet seed, signed transaction,
ordinary wallet RPC request, URL, QR backup or log. Other Nano RPC/PoW options
continue to work without a paid provider key.

See [Nano.to API key management](https://rpc.nano.to/account/api-keys) and the
[PoW vault security design](docs/security/pow-api-key-vault.md). Use dedicated,
revocable API keys and review Nano.to's own service terms before enabling them.

## How To Use
Nault comes in different flavors to suit your needs.
#### Desktop App
Available for Windows/Mac/Linux – just head over to the [latest release](https://github.com/twister65/Nault/releases/latest) and download the version for your OS. Release notes group downloads by **Windows, macOS (Intel / Apple Silicon), and Linux distribution**. GitHub's native Assets list cannot be manually grouped. Updater feeds (`latest*.yml`) retain their filenames.

If you want to verify the binary checksum there are plenty of apps to do this. One way is using a powershell or bash terminal:

* **Powershell:** `Get-FileHash -Path '.\Nault-Windows-Setup-x.x.x.exe' -Algorithm SHA256`
* **Bash:** `openssl sha256 Nault-Linux-Portable-x.x.x-x86_64.AppImage`

Then compare the output hash with the one listed in the corresponding checksums file that you download.

**Linux installation:** Starting with releases built after this packaging change, download the package for your distribution from GitHub Releases. Native packages install Nault into the application menu (GNOME, KDE, Cinnamon and XFCE), using the Nault icon:

- **Debian / Ubuntu / Linux Mint / Pop!_OS:** `sudo apt install ./Nault-Linux-Debian-Ubuntu-Mint-*.deb`
- **Fedora:** `sudo dnf install ./Nault-Linux-Fedora-openSUSE-*.rpm`
- **openSUSE:** `sudo zypper install ./03-Linux-*.rpm`
- **Arch Linux / Manjaro / EndeavourOS:** `sudo pacman -U ./Nault-Linux-Arch-Manjaro-*.pkg.tar.zst` (pacman packaging is beta; verify on the target distribution)
- **Other Linux distributions:** the portable `.AppImage` remains available; it does **not** automatically add a menu item. Use AppImageLauncher or a manual `.desktop` entry for integration.

Use the downloaded file's exact name if your shell does not expand the sample pattern. Native packages are updated by installing the next release package unless a package repository is configured; GitHub downloads alone do not set up an APT/DNF/Pacman repository. For verification and functional test guidance, see [Linux packaging](docs/linux-packaging.md).

#### Web App
You can also use this Nault fork from any device on the web at [twister32.changeip.org](https://twister32.changeip.org/). Encrypted v2 wallet backup QR links created on this site point back to its own `/import-wallet` page. For recovery, also retain a securely stored offline seed or encrypted JSON backup; a QR link alone is not a durable backup.

Both the desktop (recommended) and web version supports the Ledger Nano hardware wallet. For help using it, please refer to [this guide](https://docs.nault.cc/2020/08/04/ledger-guide.html).

The original upstream web image remains available in the [upstream Docker Hub repository](https://hub.docker.com/r/nault/nault) using: `docker pull nault/nault:latest`. This upstream image is **not** the same as this fork's latest `master` and may not support v2 wallet backups.

A full security guide and other useful articles can be found in the [Nault Docs](https://docs.nault.cc).

#### Mobile App
There is no native mobile app, but the web wallet contains a Progressive Web App (PWA). That allows you to run it in offline mode for remote-signing.

To install Nault on **Android or iOS**, open [twister32.changeip.org](https://twister32.changeip.org/) in **Google Chrome** on your phone. Open the Nault menu and select **"Install Nault for Android"** or **"Install Nault for iOS"**, depending on your device, then follow the installation instructions. The PWA opens on the same HTTPS origin and can work offline once installed and cached.

**Ledger Bluetooth compatibility:** Web Bluetooth is supported in Chrome on Android, but **not in Chrome on iOS**. Installing the PWA on an iPhone does not enable Bluetooth connections to a Ledger Nano X.

## How To Help

Thanks for your interest in contributing! There are many ways to contribute to this project. [Get started here at CONTRIBUTING.md](CONTRIBUTING.md).

If you want to know how to setup the development environment head over to [DEVELOPMENT.md](DEVELOPMENT.md).

## Acknowledgements

Special thanks to the following!

- [Nault](https://github.com/Nault/Nault) - The original upstream
- [Electron](https://www.electronjs.org/) - Build cross-platform desktop apps with JavaScript, HTML, and CSS
- [Angular](https://angular.dev/) - Deliver web apps with confidence 🚀
- [rsnano-node](https://github.com/rsnano-node/rsnano-node) - RsNano is a Rust port of nano-node
- [nano-work-server](https://github.com/nanocurrency/nano-work-server) - A dedicated work server for the Nano cryptocurrency
- [Nano.to](https://rpc.nano.to/) - Nano RPC infrastructure and proof-of-work services
- [Nanonode.de](https://nanonode.de/) - Nano node monitoring and network data API
- [NanoTicker](https://www.nanoticker.org/) - Nano network monitoring, representative statistics, and decentralization metrics
- [ChatGPT](https://chatgpt.com/) - ChatGPT helped me improve the stability and security of Nault.
  
Thanks a lot!
