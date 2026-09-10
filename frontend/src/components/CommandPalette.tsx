import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { useToast } from '@/context/ToastContext'
import { isApplePlatform } from '@/models/platform'
import Keycap from '@/components/Keycap'

const UNQUERIED_CREDENTIAL_LIMIT = 6

type Command = {
  id: string
  label: string
  detail?: string
  icon: string
  group: string
  run: () => void
  altRun?: () => void
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const pushToast = useToast()
  const { vaultData, isUnlocked, clearVaultSession } = useVault()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    // Only claim the shortcut where the palette can actually open, or the marketing and
    // auth pages would swallow the browser's own Cmd/Ctrl+K and do nothing with it.
    if (!isUnlocked) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isUnlocked])

  const entries = useMemo(() => vaultData?.entries ?? [], [vaultData])

  const commands = useMemo<Command[]>(() => {
    const needle = query.trim().toLowerCase()

    const matches = entries
      .filter(
        (entry) =>
          !needle ||
          entry.site.toLowerCase().includes(needle) ||
          entry.username.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.site.localeCompare(b.site, undefined, { sensitivity: 'base' }))

    const credentials: Command[] = (needle ? matches : matches.slice(0, UNQUERIED_CREDENTIAL_LIMIT)).map(
      (entry) => ({
        id: `entry-${entry.id}`,
        label: entry.site,
        detail: entry.username,
        icon: 'content_copy',
        group: 'Credentials',
        run: async () => {
          try {
            await navigator.clipboard.writeText(entry.password)
            pushToast(`Password for ${entry.site} copied to clipboard.`)
          } catch {
            pushToast(`Could not reach the clipboard. Open ${entry.site} to copy it manually.`)
          }
        },
        altRun: () => navigate('/vault', { state: { editEntryId: entry.id } }),
      })
    )

    const actions: Command[] = [
      {
        id: 'add',
        label: 'Add credential',
        icon: 'add',
        group: 'Actions',
        run: () => navigate('/vault', { state: { addEntry: true } }),
      },
      { id: 'go-vault', label: 'Go to Vault', icon: 'lock', group: 'Actions', run: () => navigate('/vault') },
      {
        id: 'go-generator',
        label: 'Go to Generator',
        icon: 'casino',
        group: 'Actions',
        run: () => navigate('/generator'),
      },
      {
        id: 'go-sharing',
        label: 'Go to Sharing',
        icon: 'group',
        group: 'Actions',
        run: () => navigate('/vault/sharing'),
      },
      {
        id: 'go-activity',
        label: 'Go to Activity',
        icon: 'history',
        group: 'Actions',
        run: () => navigate('/vault/activity'),
      },
      {
        id: 'go-breach',
        label: 'Go to Breach monitor',
        icon: 'warning',
        group: 'Actions',
        run: () => navigate('/vault/breach'),
      },
      {
        id: 'lock',
        label: 'Lock vault',
        detail: 'Clears the decrypted vault from this browser',
        icon: 'lock_clock',
        group: 'Actions',
        run: () => {
          localStorage.removeItem('cipher_token')
          clearVaultSession()
          navigate('/')
        },
      },
    ].filter((command) => !needle || command.label.toLowerCase().includes(needle))

    return [...credentials, ...actions]
  }, [entries, query, navigate, pushToast, clearVaultSession])

  const hiddenCredentialCount = query.trim()
    ? 0
    : Math.max(entries.length - UNQUERIED_CREDENTIAL_LIMIT, 0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLInputElement>('input')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, commands.length])

  // The palette is a vault-session tool: with nothing decrypted there is nothing to search
  // and no action worth offering.
  if (!isUnlocked) {
    return null
  }

  function closePalette() {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  function runCommand(command: Command, useAlt: boolean) {
    closePalette()
    if (useAlt && command.altRun) {
      command.altRun()
      return
    }
    void command.run()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault()
      setActiveIndex((current) => (commands.length ? (current + 1) % commands.length : 0))
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault()
      setActiveIndex((current) =>
        commands.length ? (current - 1 + commands.length) % commands.length : 0
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = commands[activeIndex]
      if (command) {
        runCommand(command, event.metaKey || event.ctrlKey)
      }
    }
  }

  let lastGroup = ''

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault()
        closePalette()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          closePalette()
        }
      }}
    >
      <div className="palette-panel w-[min(40rem,92vw)] border-2 border-ink bg-paper shadow-[8px_8px_0px_0px_theme(colors.ink)] flex flex-col">
        <div className="flex items-center gap-3 border-b-2 border-ink px-5">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
            search
          </span>
          <input
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={commands[activeIndex] ? `palette-${commands[activeIndex].id}` : undefined}
            aria-label="Search credentials or commands"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-h-14 bg-transparent border-0 outline-none font-body-lg text-body-lg text-ink placeholder:text-on-surface-variant"
            placeholder="Search credentials or a command…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {commands.length === 0 && (
            <li className="px-5 py-6 font-body-md text-body-md text-on-surface-variant">
              Nothing matches “{query.trim()}”.
            </li>
          )}
          {commands.map((command, index) => {
            const isActive = index === activeIndex
            const showGroup = command.group !== lastGroup
            lastGroup = command.group

            return (
              <Fragment key={command.id}>
                {showGroup && (
                  <li
                    role="presentation"
                    className="px-5 pt-3 pb-1 font-label-caps text-label-caps uppercase text-on-surface-variant"
                  >
                    {command.group}
                  </li>
                )}
                <li
                  id={`palette-${command.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={(event) => runCommand(command, event.metaKey || event.ctrlKey)}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer ${
                    isActive ? 'bg-mint text-ink' : 'text-ink'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${
                      isActive ? 'text-ink' : 'text-on-surface-variant'
                    }`}
                    aria-hidden="true"
                  >
                    {command.icon}
                  </span>
                  <span className="font-body-md text-body-md truncate">{command.label}</span>
                  {command.detail && (
                    <span
                      className={`font-body-md text-sm truncate ${
                        isActive ? 'text-ink' : 'text-on-surface-variant'
                      }`}
                    >
                      {command.detail}
                    </span>
                  )}
                  {isActive && command.altRun && (
                    <span className="ml-auto shrink-0 hidden md:flex items-center gap-2">
                      <Keycap>↵ copy</Keycap>
                      <Keycap>{isApplePlatform ? '⌘↵ edit' : 'Ctrl ↵ edit'}</Keycap>
                    </span>
                  )}
                </li>
              </Fragment>
            )
          })}
          {hiddenCredentialCount > 0 && (
            <li className="px-5 pt-2 pb-3 font-body-md text-sm text-on-surface-variant">
              {hiddenCredentialCount} more credential{hiddenCredentialCount === 1 ? '' : 's'} — keep
              typing to narrow.
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline-variant px-5 py-3">
          <span className="flex items-center gap-1.5">
            <Keycap>↑↓</Keycap>
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>↵</Keycap>
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">run</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>esc</Keycap>
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">close</span>
          </span>
          <span className="ml-auto font-label-caps text-label-caps uppercase text-on-surface-variant">
            Nothing leaves this browser
          </span>
        </div>
      </div>
    </dialog>
  )
}
