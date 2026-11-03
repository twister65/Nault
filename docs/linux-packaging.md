# Nault Linux desktop packages

The tag-triggered **Electron App Release** workflow builds four Linux x64 formats from the same immutable release tag, alongside the existing Windows NSIS installer and macOS Intel DMG. A release is not published until artifacts for all platforms exist and SHA256 verification succeeds. This does not deploy the PWA.

| Linux distribution | Artifact | Application menu |
| --- | --- | --- |
| Debian, Ubuntu, Linux Mint, Pop!_OS | DEB | Automatically installed |
| Fedora, openSUSE, RHEL family | RPM | Automatically installed |
| Arch Linux, Manjaro, EndeavourOS | Pacman package (beta) | Automatically installed |
| Other compatible x86_64 Linux | AppImage | Optional, e.g. AppImageLauncher |

The native packages are produced using electron-builder's Linux targets. Nault uses \`cc.nault.desktop\` with the Nault icon, a freedesktop \`Office;Finance;\` category, and an executable named \`nault\`. The CI script \`scripts/verify-linux-packages.sh\` checks the DEB launcher fields/icons and that RPM/Pacman packages contain the launcher/icons. **These are archive checks, not full installation or hardware tests.**

## Install

Download the release artifact for your distribution, verify its SHA256 against \`SHA256SUMS\`, then from the download directory run one of:

\`\`\`bash
sudo apt install ./Nault*.deb          # Debian / Ubuntu / Mint
sudo dnf install ./Nault*.rpm          # Fedora
sudo zypper install ./Nault*.rpm       # openSUSE
sudo pacman -U ./Nault*.pkg.tar.zst    # Arch / Manjaro (beta)
\`\`\`

Use the exact filename if the wildcard does not match one artifact. Installation and removal are handled by the distribution's normal package manager. The packaged launcher should appear as **Nault** in GNOME, KDE, Cinnamon and XFCE menus. For AppImage, execute the downloaded file directly (after making it executable); menu integration is a separate user step using AppImageLauncher or a manually installed launcher. It is **not automatic** just because a desktop file exists inside the AppImage.

There is no APT/DNF/Pacman package repository in this change. Users install the next native package for updates. Do not claim unattended package-manager updates. electron-updater behaviour for installed native packages must be checked separately and must never alter wallet keys or trigger automatic Ledger signing.

## Release validation

1. Confirm \`package.json\`, \`package-lock.json\` and the Git tag agree on the version.
2. Check that the merge gate, dependency audit and CodeQL checks pass.
3. Verify the Linux workflow produces four nonempty artifacts, with the expected \`.desktop\` entry and icon, plus checksum verification and the Windows/macOS artifacts.
4. On Ubuntu/Debian, Fedora/openSUSE and Arch/Manjaro, install the corresponding native package on test systems. Confirm the Nault menu entry and icon, launch, only one window, quit, reinstall/upgrade and uninstall.
5. With a Nano S Plus USB and Nano X USB/Bluetooth, validate connection, signing, user refusal, disconnect/reconnect and absence of unexpected device permissions. The CI cannot validate physical hardware.
6. Check application version/commit and ensure an existing encrypted or Ledger wallet remains available after upgrade. Avoid handling real recovery seeds in CI.
7. Only after release review, publish the GitHub Release; Apache/PWA deployment stays a separate manual step.

Notes: Pacman is beta in electron-builder 26 and requires real Arch-family testing before it is advertised as fully validated. Flatpak/Snap are deliberately deferred because sandboxed hardware USB/HID/Bluetooth access needs its own permission and hardware-validation design.
