import { useState } from 'react'
import { api, type AuthUser } from '../api/client'

interface Props {
  user: AuthUser
  onLogout: () => void
}

export function UserMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const label = user.handle ? `@${user.handle}` : user.did

  const logout = async () => {
    await api.authLogout()
    setOpen(false)
    onLogout()
  }

  return (
    <>
      <button
        type="button"
        className="user-menu user-menu-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {user.avatarUrl ? (
          <img className="user-menu-avatar" src={user.avatarUrl} alt="" width={28} height={28} />
        ) : null}
        <span className="user-menu-label">{label}</span>
      </button>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-dialog user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Account</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="user-modal-identity">
                {user.avatarUrl ? (
                  <img
                    className="user-menu-avatar user-modal-avatar"
                    src={user.avatarUrl}
                    alt=""
                    width={56}
                    height={56}
                  />
                ) : null}
                <div className="user-modal-names">
                  {user.displayName ? (
                    <span className="user-modal-display-name">{user.displayName}</span>
                  ) : null}
                  <span className="user-modal-handle">{label}</span>
                  <span className="user-modal-did">{user.did}</span>
                </div>
              </div>
              {user.isMaster || user.isGlobalVerifier ? (
                <div className="user-modal-badges">
                  {user.isMaster ? <span className="badge badge-muted">Master</span> : null}
                  {user.isGlobalVerifier ? (
                    <span className="badge badge-on">Marketplace operator</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
