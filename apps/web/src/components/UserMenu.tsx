import { api, type AuthUser } from '../api/client'

interface Props {
  user: AuthUser
  onLogout: () => void
}

export function UserMenu({ user, onLogout }: Props) {
  const label = user.handle ? `@${user.handle}` : user.did

  const logout = async () => {
    await api.authLogout()
    onLogout()
  }

  return (
    <div className="user-menu">
      {user.avatarUrl ? (
        <img className="user-menu-avatar" src={user.avatarUrl} alt="" width={28} height={28} />
      ) : null}
      <span className="user-menu-label">{label}</span>
      {user.isMaster ? <span className="badge badge-muted user-menu-master">Master</span> : null}
      {user.isGlobalVerifier ? (
        <span className="badge badge-on user-menu-master">Marketplace operator</span>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  )
}
