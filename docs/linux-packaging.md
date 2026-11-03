# Nault Linux desktop packages

The tag-triggered **Electron App Release** workflow builds four Linux x64 formats from the same immutable release tag, alongside the existing Windows NSIS installer and macOS Intel DMG. A release is not published until artifacts for all platforms exist and SHA256 verification succeeds. This does not deploy the PWA.

| Linux distribution | Artifact | Application menu |
| --- | --- | --- |
| Debian, Ubuntu, Linux Mint, Pop!_OS | DEB | Automatically installed |
| Fedora, openSUSE, RHEL family | RPM | Automatically installed |
| Arch Linux, Manjaro, EndeavourOS | Pacman package (beta) | Automatically installed |
| Other compatible x86_64 Linux | AppImage | Optional, e.g. AppImageLauncher |

The native packages are produced using electron-builder's Linux targets. Nault uses `cc.nault.desktop` with the Nault icon, a freedesktop `Office;Finance;` category, and an executable named `nault`. CI verifies the package contents and all four update archives.

Each release also installs the **real built native package** in separate disposable Docker containers for Ubuntu 26.04, Debian 13, Fedora 44, openSUSE Leap 16.0 and Arch Linux. These five jobs test native dependency resolution, installed version, desktop launcher, icon, executable, shared libraries and package removal. Publication is blocked if any job fails. **These are non-graphical tests**; menu rendering, actual updater authorization and physical Ledger USB/Bluetooth need separate manual tests.

## Install

Download the release artifact for your distribution, verify its SHA256 against `SHA256SUMS`, then from the download directory run one of:

```bash
sudo apt install ./nault*.deb          # Debian / Ubuntu / Mint
sudo dnf install ./nault*.rpm          # Fedora
sudo zypper install ./nault*.rpm       # openSUSE
sudo pacman -U ./nault*.pkg.tar.zst    # Arch / Manjaro (beta)
```

Use the exact filename if the wildcard does not match one artifact. Installation and removal are handled by the distribution's normal package manager. The packaged launcher should appear as **Nault** in GNOME, KDE, Cinnamon and XFCE menus. For AppImage, execute the downloaded file directly (after making it executable); menu integration is a separate user step using AppImageLauncher or a manually installed launcher. It is **not automatic** just because a desktop file exists inside the AppImage.

There is no APT/DNF/Pacman package repository in this change, so distribution package managers will **not** update Nault unattended. The app uses electron-updater 6.8.12 with a GitHub release feed for all four formats. It checks on launch and from Help > Check for Updates, asks before downloading, and uses a manifest checksum for the chosen artifact. AppImages can replace their user-owned file; deb/rpm/pacman require the normal privileged package install (pkexec/sudo, depending on the distribution) and may prompt for administrator authentication. Native Linux updates are explicitly non-silent. If authentication or the native updater fails, download the corresponding next release package and use the distribution's package manager to install it.

The CI must verify `latest-linux.yml`, the matching release version and SHA-512 for each of AppImage, deb, rpm and pacman, and the packaged `resources/app-update.yml` must point at twister65/Nault. A draft release cannot be used as the update feed; publishing remains gated by normal release review. Checksums are not package signatures: test distribution-specific privilege prompts and policies before enabling real upgrades. Do not alter wallet keys or trigger automatic Ledger signing.

## Release validation

1. Confirm `package.json`, `package-lock.json` and the Git tag agree on the version.
2. Check that the merge gate, dependency audit and CodeQL checks pass.
3. Verify the Linux workflow produces four nonempty artifacts with expected `.desktop` entries and icons; verify `latest-linux.yml` references all four archive types, matches SHA-512 checksums, and targets the maintained fork. Check Windows/macOS artifacts.
4. Require all five isolated Linux installation/removal jobs to pass. Then visually inspect the real GNOME/KDE/Cinnamon desktop menu and icon on representative Linux desktops. Once two adjacent published release versions exist, manually test Help > Check for Updates, GitHub detection, confirmation before download, GUI authentication, install, relaunch and refusal of authentication. For AppImage, check the APPIMAGE environment path and replacement of a user-writable file. Confirm upgrade preserves settings.
5. On a physical Linux test machine, validate Nano S Plus USB and Nano X USB connection, signing, refusal and reconnect behaviour. Bluetooth is intentionally excluded from Linux acceptance tests while its platform issues remain unresolved. CI cannot test physical hardware.
6. Check application version/commit and ensure an existing encrypted or Ledger wallet remains available after upgrade. Avoid handling real recovery seeds in CI.
7. Only after release review, publish the GitHub Release; Apache/PWA deployment stays a separate manual step.

Notes: Pacman is beta in electron-builder 26 and requires real Arch-family testing before it is advertised as fully validated. Flatpak/Snap are deliberately deferred because sandboxed hardware USB/HID/Bluetooth access needs its own permission and hardware-validation design.
