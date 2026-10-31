import { Component, OnInit } from '@angular/core';
import { environment } from 'environments/environment';

// Validate an embedded build-time identifier before showing or linking to it.
// Angular's --define injects the checked-out SHA in the application bundle.
export function readBuildCommit(metadata: unknown): string | null {
  const sha = metadata !== null && typeof metadata === 'object'
    ? (metadata as { commit?: unknown }).commit : null;
  return typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha)
    ? sha.toLowerCase() : null;
}

// Only display a valid build-time release version; never trust runtime URLs.
export function readBuildVersion(metadata: unknown): string | null {
  const value = metadata !== null && typeof metadata === 'object'
    ? (metadata as { version?: unknown }).version : null;
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
    ? value : null;
}

// Use the origin of the running PWA instead of hard-coding a deployment URL.
// The Electron renderer can use file:// and must not display it as a PWA domain.
export function readPwaDomain(isDesktop: boolean, location: Pick<Location, 'protocol' | 'hostname'> | null): string | null {
  if (isDesktop || !location || (location.protocol !== 'https:' && location.protocol !== 'http:')) return null;
  const hostname = location.hostname.trim();
  return hostname || null;
}

@Component({
  selector: 'app-about-nault',
  templateUrl: './about-nault.component.html',
  standalone: false
})
export class AboutNaultComponent implements OnInit {
  readonly isDesktop = environment.desktop;
  readonly applicationTypeKey = this.isDesktop ? 'about-nault.platform-desktop' : 'about-nault.platform-pwa';
  pwaDomain: string | null = null;
  releaseVersion: string | null = null;
  commitShort: string | null = null;
  commitUrl: string | null = null;

  ngOnInit(): void {
    this.pwaDomain = readPwaDomain(this.isDesktop, typeof window === 'undefined' ? null : window.location);
    // This is compiled into the JavaScript served by the PWA or Electron;
    // never fetch a separate JSON asset whose availability/cache may differ.
    // 'typeof' also permits isolated tests without a build replacement.
    const buildSha = typeof __NAULT_BUILD_COMMIT__ === 'undefined'
      ? null : __NAULT_BUILD_COMMIT__;
    const buildVersion = typeof __NAULT_BUILD_VERSION__ === 'undefined'
      ? null : __NAULT_BUILD_VERSION__;
    this.releaseVersion = readBuildVersion({ version: buildVersion });
    const sha = readBuildCommit({ commit: buildSha });
    this.commitShort = sha ? sha.slice(0, 7) : null;
    this.commitUrl = sha ? `https://github.com/twister65/Nault/commit/${sha}` : null;
  }
}
