import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

// Never display or link to an unchecked value from the build metadata asset.
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

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    // Use an asset packaged with this particular PWA/Electron build rather
    // than asking GitHub for its latest branch HEAD (which may have moved).
    this.http.get<unknown>('assets/build-info.json').subscribe({
      next: metadata => {
        const sha = readBuildCommit(metadata);
        this.commitShort = sha ? sha.slice(0, 7) : null;
        this.commitUrl = sha ? `https://github.com/twister65/Nault/commit/${sha}` : null;
      },
      error: () => {
        this.commitShort = null;
        this.commitUrl = null;
      }
    });
  }
}
