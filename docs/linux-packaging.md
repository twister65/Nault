# Nault Linux desktop packages

GitHub's raw Assets list cannot be grouped manually. Instead, release notes group the downloads under **Windows**, **macOS (Intel / Apple Silicon)** and **Linux**, without numeric prefixes. Linux installer names identify Debian/Ubuntu/Mint, Fedora/openSUSE, Arch/Manjaro or portable AppImage. Two native macOS runners generate x64 and arm64 DMG/ZIP packages; a release-assembly job merges their verified update entries into one `latest-mac.yml`. The updater metadata filenames `latest.yml`, `latest-mac.yml` and `latest-linux.yml` remain unchanged.

The tag-triggered **Electron App Release** workflow builds four Linux x64 formats from the same immutable release tag, alongside Windows NSIS and native macOS Intel and Apple Silicon DMG/ZIP archives. A release is not published until artifacts for all platforms exist, SHA256 verification succeeds, and the nine release installers/update ZIPs pass signed **SLSA build provenance** verification against the exact tag commit and trusted workflow. See [Build provenance and user verification](security/release-build-provenance.md). This does not deploy the PWA.

| Linux distribution | Artifact | Application menu |
| --- | --- | --- |
| Debian, Ubuntu, Linux Mint, Pop!_OS | DEB | Automatically installed |
| Fedora, openSUSE, RHEL family | RPM | Automatically installed |
| Arch Linux, Manjaro, EndeavourOS | Pacman package (beta) | Automatically installed |
| Other compatible x86_64 Linux | AppImage | Optional, e.g. AppImageLauncher |

The native packages are produced using electron-builder's Linux targets. Nault uses `cc.nault.desktop` with the Nault icon, a freedesktop `Office;Finance;` category, and an executable named `nault`. CI verifies the package contents and all four update archives.

Each release also installs the **real built native package** in separate disposable Docker containers for Ubuntu 26.04, Debian 13, Fedora 44, openSUSE Leap 16.0 and Arch Linux. These five jobs test native dependency resolution, installed version, desktop launcher, icon, executable, shared libraries and package removal. Native DEB/RPM/Pacman metadata explicitly declares the Electron runtime dependencies, including libgbm and ALSA; missing system libraries fail the CI. The RPM package uses shared-library capability requirements to work on both Fedora and openSUSE. Publication is blocked if any job fails. **These are non-graphical tests**; menu rendering, actual updater authorization and physical Ledger USB/Bluetooth need separate manual tests.

## Manually validated desktop compatibility (v1.19.3)

The following installations were manually exercised on **13 November 2026**. They complement the container-based, non-graphical CI checks above; they are not a claim of exhaustive hardware or distribution support.

| Distribution | Desktop / display session | Release package | Manual result |
| --- | --- | --- | --- |
| Ubuntu 26.04 LTS | GNOME | DEB (amd64) | Passed |
| Ubuntu 26.04 LTS | GNOME | AppImage (x64) | Passed |
| Fedora 45 | GNOME | RPM (x86_64) | Passed |
| openSUSE Tumbleweed | KDE Plasma / Wayland | RPM (x86_64) | Passed |
| Arch Linux | KDE Plasma | Pacman (x64, `.pkg.tar.zst`) | Passed |

Manual validation covered native package installation, application launch and desktop interaction, with functional checks confirmed by the tester. GNOME and KDE Plasma were exercised, including a confirmed Wayland session on openSUSE. Session type was not separately recorded for the other desktops. These results do **not** establish Ledger USB/Bluetooth passthrough or signing compatibility inside the virtual machines, nor automatic updater behavior on each distribution. Debian itself has not yet been manually tested, despite the Ubuntu DEB validation and Debian container CI coverage.

**Other platforms:** macOS Intel (x64) physical installation and runtime testing remain **pending**. Successful macOS CI packaging does not count as a manual compatibility test.

## Install

Download the release artifact for your distribution, verify its SHA256 against `SHA256SUMS`, then from the download directory run one of:

```bash
sudo apt install ./Nault-Linux-Debian-Ubuntu-Mint-*.deb          # Debian / Ubuntu / Mint
sudo dnf install ./Nault-Linux-Fedora-openSUSE-*.rpm          # Fedora
sudo zypper install ./Nault-Linux-Fedora-openSUSE-*.rpm       # openSUSE
sudo pacman -U ./Nault-Linux-Arch-Manjaro-*.pkg.tar.zst    # Arch / Manjaro (beta)
```

Use the exact filename if the wildcard does not match one artifact. Installation and removal are handled by the distribution's normal package manager. The packaged launcher should appear as **Nault** in GNOME, KDE, Cinnamon and XFCE menus. For AppImage, execute the downloaded file directly (after making it executable); menu integration is a separate user step using AppImageLauncher or a manually installed launcher. It is **not automatic** just because a desktop file exists inside the AppImage.

There is no APT/DNF/Pacman package repository in this change, so distribution package managers will **not** update Nault unattended. The app uses electron-updater 6.8.12 with a GitHub release feed for all four formats. It checks on launch and from Help > Check for Updates, asks before downloading, and uses a manifest checksum for the chosen artifact. AppImages can replace their user-owned file; deb/rpm/pacman require the normal privileged package install (pkexec/sudo, depending on the distribution) and may prompt for administrator authentication. Native Linux updates are explicitly non-silent. If authentication or the native updater fails, download the corresponding next release package and use the distribution's package manager to install it.

The CI must verify `latest-linux.yml`, the matching release version and SHA-512 for each of AppImage, deb, rpm and pacman, and the packaged `resources/app-update.yml` must point at twister65/Nault. A draft release cannot be used as the update feed; publishing remains gated by normal release review. Checksums are not package signatures: test distribution-specific privilege prompts and policies before enabling real upgrades. Do not alter wallet keys or trigger automatic Ledger signing.

**macOS updates:** the ZIP archives are required for Squirrel.Mac. CI verifies the merged update feed and file hashes, but macOS requires Apple code signing before in-app installation can work. The current unsigned builds must not be described as tested automatic upgrades.

## Release validation

1. Confirm `package.json`, `package-lock.json` and the Git tag agree on the version.
2. Check that the merge gate, dependency audit and CodeQL checks pass.
3. Verify the Linux workflow produces four nonempty artifacts with expected `.desktop` entries and icons; verify `latest-linux.yml` references all four archive types, matches SHA-512 checksums, and targets the maintained fork. Check Windows/macOS artifacts.
4. Require all five isolated Linux installation/removal jobs to pass. Then visually inspect the real GNOME/KDE/Cinnamon desktop menu and icon on representative Linux desktops. Once two adjacent published release versions exist, manually test Help > Check for Updates, GitHub detection, confirmation before download, GUI authentication, install, relaunch and refusal of authentication. For AppImage, check the APPIMAGE environment path and replacement of a user-writable file. Confirm upgrade preserves settings.
5. On a physical Linux test machine, validate Nano S Plus USB and Nano X USB connection, signing, refusal and reconnect behaviour. Bluetooth is intentionally excluded from Linux acceptance tests while its platform issues remain unresolved. CI cannot test physical hardware.
6. Check application version/commit and ensure an existing encrypted or Ledger wallet remains available after upgrade. Avoid handling real recovery seeds in CI.
7. Only after release review, publish the GitHub Release; Apache/PWA deployment stays a separate manual step.

Notes: Pacman remains a beta target in electron-builder 26 even though Nault v1.19.3 passed a manual Arch Linux desktop test. Flatpak/Snap are deliberately deferred because sandboxed hardware USB/HID/Bluetooth access needs its own permission and hardware-validation design.
