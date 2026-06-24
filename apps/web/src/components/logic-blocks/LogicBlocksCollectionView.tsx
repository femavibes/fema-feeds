import { useEffect, useState } from 'react'

import type { LogicBlockPackage } from '@cfb/core-types'



import { api } from '../../api/client'

import { LogicBlockTrustBadge } from './logic-block-labels'



interface Props {

  selectedId: string | null

  onSelect: (pkg: LogicBlockPackage) => void

  onEdit?: (pkg: LogicBlockPackage) => void

}



export function LogicBlocksCollectionView({ selectedId, onSelect, onEdit }: Props) {

  const [packages, setPackages] = useState<LogicBlockPackage[]>([])

  const [loading, setLoading] = useState(true)



  const load = () => {

    setLoading(true)

    void api

      .listLogicBlockCollection()

      .then((res) => setPackages(res.packages))

      .catch(() => setPackages([]))

      .finally(() => setLoading(false))

  }



  useEffect(() => {

    load()

  }, [])



  return (

    <div className="logic-blocks-collection">

      {loading && <p className="card-hint">Loading collection…</p>}

      {!loading && packages.length === 0 && (

        <p className="card-hint">

          No blocks yet. Click <strong>New logic block</strong> above or save a group from a feed&apos;s

          visual editor with &quot;Save to my collection&quot;.

        </p>

      )}

      <ul className="logic-blocks-catalog-list">

        {packages.map((pkg) => (

          <li key={`${pkg.id}@${pkg.version}`} className="logic-blocks-catalog-row">

            <button

              type="button"

              className={`logic-blocks-catalog-item${selectedId === pkg.id ? ' is-selected' : ''}`}

              onClick={() => onSelect(pkg)}

            >

              <div className="logic-blocks-catalog-meta">

                <span className="logic-blocks-catalog-name">{pkg.name}</span>

                <span className="logic-blocks-catalog-sub">v{pkg.version} · {pkg.slug}</span>

                {pkg.description ? (

                  <span className="logic-blocks-catalog-desc">{pkg.description}</span>

                ) : null}

              </div>

              <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />

            </button>

            {onEdit ? (

              <button

                type="button"

                className="btn btn-secondary btn-sm logic-blocks-catalog-edit"

                onClick={() => onEdit(pkg)}

              >

                Edit logic

              </button>

            ) : null}

          </li>

        ))}

      </ul>

    </div>

  )

}


