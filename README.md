# Nault

![GitHub release (latest by date)](https://img.shields.io/github/v/release/twister65/Nault)
[![GitHub All Releases](https://img.shields.io/github/downloads/twister65/Nault/total)](https://github.com/twister65/Nault/releases/latest)
[![Discord](https://img.shields.io/badge/discord-join%20chat-orange.svg?logo=discord&color=7289DA)](https://discord.nanocenter.org)

Nault is a community-driven fork of the popular nano wallet [NanoVault](https://github.com/cronoh/nanovault) 💙

It's a fully client-side signing wallet for sending and receiving [nano](https://github.com/nanocurrency/nano-node/) either directly in your browser at [twister32.changeip.org](https://twister32.changeip.org/) or with the [desktop app](https://github.com/twister65/Nault/releases/latest).

Seamless integration with any nano compatible RPC backend/websocket and the aim to be more frequently maintained are some of the main features. Those together will greatly increase the stability, performance and uptime.

![Nault Screenshot](/src/assets/img/preview.png)
___

## How To Use
Nault comes in different flavors to suit your needs.
#### Desktop App
Available for Windows/Mac/Linux – just head over to the [latest release](https://github.com/twister65/Nault/releases/latest) and download the version for your OS. Arch Linux users may [install it from the (unofficial) AUR](https://aur.archlinux.org/packages/nault-bin/).

If you want to verify the binary checksum there are plenty of apps to do this. One way is using a powershell or bash terminal:

* **Powershell:** `Get-FileHash -Path '.\Nault-Setup-x.x.x-Windows.exe' -Algorithm SHA256`
* **Bash:** `openssl sha256 Nault-x.x.x-Linux.AppImage`

Then compare the output hash with the one listed in the corresponding checksums file that you download.

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

## Support

If you are looking for more interactive and quick support compared to creating a new Github issue, you will then find most of the developers in the Nault channel over at the [TNC discord server](https://discord.nanocenter.org/).

## Acknowledgements

Special thanks to the following!

- [NanoVault](https://github.com/cronoh/nanovault) - The original one
- [numtel/nano-webgl-pow](https://github.com/numtel/nano-webgl-pow) - WebGL PoW Implementation
- [jaimehgb/RaiBlocksWebAssemblyPoW](https://github.com/jaimehgb/RaiBlocksWebAssemblyPoW) - CPU PoW Implementation
- [dcposch/blakejs](https://github.com/dcposch/blakejs) - Blake2b Implementation
- [dchest/tweetnacl-js](https://github.com/dchest/tweetnacl-js) - Cryptography Implementation

## Donations

If you have found Nault useful and are feeling generous, you can donate at
`nano_3niceeeyiaa86k58zhaeygxfkuzgffjtwju9ep33z9c8qekmr3iuc95jbqc8`

Thanks a lot!
