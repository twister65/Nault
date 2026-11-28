import communityReps from '../../assets/nano-community-representatives.json';
import { DEFAULT_REPRESENTATIVE } from './default-representative';

// Offline display-only names (MIT-licensed nano-community directory).
// These aliases NEVER imply Trusted status, uptime or network participation.
const aliases: Record<string, string> = {
  ...(communityReps as Record<string, string>),
  [DEFAULT_REPRESENTATIVE.id]: DEFAULT_REPRESENTATIVE.name,
};

export function getDirectoryRepresentativeName(account: string | null | undefined): string | null {
  return account ? aliases[account.toLowerCase()] || null : null;
}

export function getDirectoryRepresentatives(): Array<{id: string; name: string}> {
  return Object.entries(aliases).map(([id, name]) => ({ id, name }));
}
