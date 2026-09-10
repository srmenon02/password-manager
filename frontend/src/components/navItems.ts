export type NavItem = { label: string; to: string }

export const VAULT_NAV: NavItem[] = [
  { label: 'Vault', to: '/vault' },
  { label: 'Generator', to: '/generator' },
  { label: 'Sharing', to: '/vault/sharing' },
  { label: 'Activity', to: '/vault/activity' },
  { label: 'Breach', to: '/vault/breach' },
]
