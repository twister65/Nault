import { Component, OnInit } from '@angular/core';

// Validate an embedded build-time identifier before showing or linking to it.
// Angular's --define injects the checked-out SHA in the application bundle.
export function readBuildCommit(metadata: unknown): string | null {
  const sha = metadata !== null && typeof metadata === 'object'
    ? (metadata as { commit?: unknown }).commit : null;
  return typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha)
    ? sha.toLowerCase() : null;
}

@Component({
  selector: 'app-about-nault',
  templateUrl: './about-nault.component.html',
  standalone: false
})
export class AboutNaultComponent implements OnInit {
  commitShort: string | null = null;
  commitUrl: string | null = null;

  ngOnInit(): void {
    // This is compiled into the JavaScript served by the PWA or Electron;
    // never fetch a separate JSON asset whose availability/cache may differ.
    // 'typeof' also permits isolated tests without a build replacement.
    const buildSha = typeof __NAULT_BUILD_COMMIT__ === 'undefined'
      ? null : __NAULT_BUILD_COMMIT__;
    const sha = readBuildCommit({ commit: buildSha });
    this.commitShort = sha ? sha.slice(0, 7) : null;
    this.commitUrl = sha ? `https://github.com/twister65/Nault/commit/${sha}` : null;
  }
}
