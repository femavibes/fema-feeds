import { useEffect, useRef, useState } from 'react'
import type {
  L2ParamControl,
  L2ParamTargetBinding,
  L2ParamValue,
  L2RuleNode,
} from '@cfb/core-types'
import {
  bindingFromBindableField,
  bindingMatchesField,
  binaryEnumPolarity,
  type ParamBindableField,
} from '@cfb/l2-graph'

import { TermListEditor } from '../TermListEditor'
import { ToggleRow } from '../ToggleRow'
import {
  DISCOVER_MODE_OPTIONS,
  matchOpSelectOptions,
  memberArrayWhenOnLabels,
  ParamOwnedSelect,
  polarityPairOptions,
  sortNodeSettingFields,
  WhenControlOnSelect,
} from './param-bind-ui'

function isEmptyParamValue(value: L2ParamValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function seedFromTargetField(
  target: { type: string } | undefined,
  field: { key: string; property?: string; valueKind: string },
): string | string[] | undefined {
  if (!target) return undefined
  const prop = field.property ?? field.key
  const rec = target as unknown as Record<string, unknown>
  const cur = rec[prop]
  if (field.valueKind === 'stringList') {
    return Array.isArray(cur) ? [...(cur as string[])] : []
  }
  if (field.valueKind === 'string') {
    return typeof cur === 'string' ? cur : ''
  }
  return undefined
}

/** Local blur-commit input (keeps this module self-contained). */
function BlurCommitInputLite({
  value,
  disabled,
  className,
  placeholder,
  onCommit,
}: {
  value: string
  disabled?: boolean
  className?: string
  placeholder?: string
  onCommit: (next: string) => void
}) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])

  return (
    <input
      className={className}
      disabled={disabled}
      value={local}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focused.current = false
        if (local !== value) onCommit(local)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/** Property binds for one target — chrome mirrors the node inspector where possible. */
export function ParamNodeBindProps({
  nodeId,
  target,
  typeLabel,
  fields,
  nodeBindings,
  readOnly,
  controlType,
  controlLiveValue,
  allowAbsoluteValue,
  onSeedControlValue,
  setBindingsFor,
}: {
  nodeId: string
  target: L2RuleNode | undefined
  typeLabel: string
  fields: ParamBindableField[]
  nodeBindings: L2ParamTargetBinding[]
  readOnly: boolean
  controlType: L2ParamControl['type']
  controlLiveValue?: L2ParamValue
  allowAbsoluteValue?: boolean
  onSeedControlValue?: (seed: string | string[]) => void
  setBindingsFor: (nodeId: string, next: L2ParamTargetBinding[]) => void
}) {
  const textFields = fields.filter(
    (f) => f.valueKind === 'string' || f.valueKind === 'stringList',
  )
  const settingFields = sortNodeSettingFields(
    fields.filter((f) => f.valueKind !== 'string' && f.valueKind !== 'stringList'),
  )
  const isTextParam = controlType === 'string' || controlType === 'stringList'
  const opField = settingFields.find((f) => f.key === 'op')
  const otherSettings = settingFields.filter((f) => f.key !== 'op')

  const clearField = (field: ParamBindableField) => {
    setBindingsFor(
      nodeId,
      nodeBindings.filter((b) => !(b.kind === 'property' && bindingMatchesField(b, field))),
    )
  }

  const setFieldBinding = (
    field: ParamBindableField,
    partial: Partial<L2ParamTargetBinding>,
  ) => {
    const rest = nodeBindings.filter(
      (b) => !(b.kind === 'property' && bindingMatchesField(b, field)),
    )
    setBindingsFor(nodeId, [...rest, bindingFromBindableField(nodeId, field, partial)])
  }

  const renderMatchOp = (field: ParamBindableField) => {
    const polarity = binaryEnumPolarity(field)
    const active = nodeBindings.some(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )
    const existing = nodeBindings.find(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )
    const options = matchOpSelectOptions(field)

    if (allowAbsoluteValue && !polarity) {
      return (
        <div key={field.key} className="l2-param-bind-condition-head">
          <span className="l2-condition-type">{typeLabel}</span>
          <ParamOwnedSelect
            className="l2-param-bind-match-select"
            bound={active}
            value={String(existing?.value ?? field.enumValues?.[0]?.value ?? '')}
            options={options}
            readOnly={readOnly || !target}
            onUnbind={() => clearField(field)}
            onBindValue={(value) => setFieldBinding(field, { value })}
          />
        </div>
      )
    }

    if (!polarity) {
      return (
        <div key={field.key} className="l2-param-bind-member">
          <span className="card-hint">
            Match mode needs a toggle Param (or a dropdown option with absolute values).
          </span>
        </div>
      )
    }

    const whenOn = String(existing?.value ?? polarity.onValue)
    const absOpts = matchOpSelectOptions(field)
    const onLab =
      absOpts.find((o) => o.value === polarity.onValue)?.label ?? polarity.onLabel
    const offLab =
      absOpts.find((o) => o.value === polarity.offValue)?.label ?? polarity.offLabel
    return (
      <div key={field.key} className="l2-param-bind-condition-head">
        <span className="l2-condition-type">{typeLabel}</span>
        <ParamOwnedSelect
          className="l2-param-bind-match-select"
          bound={active}
          value={whenOn}
          options={polarityPairOptions(polarity.onValue, polarity.offValue, onLab, offLab)}
          readOnly={readOnly || !target}
          title="When this Param is on / off — which match mode to use"
          onUnbind={() => clearField(field)}
          onBindValue={(value) => setFieldBinding(field, { value })}
        />
      </div>
    )
  }

  const renderDiscoverMode = (field: ParamBindableField) => {
    const active = nodeBindings.some(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )
    const existing = nodeBindings.find(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )
    const whenOnDiscover = !(existing?.value === false || existing?.value === 'false')
    return (
      <ParamOwnedSelect
        key={field.key}
        className="l2-ingest-role-field"
        label="Mode"
        bound={active}
        value={whenOnDiscover ? 'true' : 'false'}
        options={DISCOVER_MODE_OPTIONS}
        readOnly={readOnly || !target}
        title="When this Param is on / off — Discover vs Filter"
        onUnbind={() => clearField(field)}
        onBindValue={(raw) => setFieldBinding(field, { value: raw === 'true' })}
      />
    )
  }

  const renderSetting = (field: ParamBindableField) => {
    if (field.key === 'runAtIngest') return renderDiscoverMode(field)

    const active = nodeBindings.some(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )
    const existing = nodeBindings.find(
      (b) => b.kind === 'property' && bindingMatchesField(b, field),
    )

    if (field.valueKind === 'member' && !field.member) {
      return (
        <div key={field.key} className="l2-param-bind-member">
          <ToggleRow
            label={field.label}
            checked={active}
            readOnly={readOnly || !target}
            ariaLabel={field.label}
            onChange={(checked) => {
              if (!checked) {
                clearField(field)
                return
              }
              setFieldBinding(field, { member: '', value: true })
            }}
          />
          {active ? (
            <>
              <BlurCommitInputLite
                className="mono"
                disabled={readOnly}
                value={existing?.member ?? ''}
                placeholder={field.memberPlaceholder ?? 'token'}
                onCommit={(member) =>
                  setFieldBinding(field, {
                    member,
                    value: existing?.value === false ? false : true,
                  })
                }
              />
              {!allowAbsoluteValue ? (
                <WhenControlOnSelect
                  readOnly={readOnly}
                  value={
                    existing?.value === false || existing?.value === 'false' ? 'off' : 'on'
                  }
                  {...memberArrayWhenOnLabels(field)}
                  onChange={(whenOn) =>
                    setFieldBinding(field, {
                      member: existing?.member ?? '',
                      value: whenOn === 'on',
                    })
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      )
    }

    if (field.valueKind === 'enum') {
      const polarity = binaryEnumPolarity(field)
      if (allowAbsoluteValue && !polarity) {
        return (
          <ParamOwnedSelect
            key={field.key}
            label={field.label}
            bound={active}
            value={String(existing?.value ?? field.enumValues?.[0]?.value ?? '')}
            options={field.enumValues ?? []}
            readOnly={readOnly || !target}
            onUnbind={() => clearField(field)}
            onBindValue={(value) => setFieldBinding(field, { value })}
          />
        )
      }
      if (polarity && !allowAbsoluteValue) {
        return (
          <ParamOwnedSelect
            key={field.key}
            label={field.label}
            bound={active}
            value={String(existing?.value ?? polarity.onValue)}
            options={polarityPairOptions(
              polarity.onValue,
              polarity.offValue,
              polarity.onLabel,
              polarity.offLabel,
            )}
            readOnly={readOnly || !target}
            title="When this Param is on / off — which value to use"
            onUnbind={() => clearField(field)}
            onBindValue={(value) => setFieldBinding(field, { value })}
          />
        )
      }
      return (
        <div key={field.key} className="l2-param-bind-member">
          <ToggleRow
            label={field.label}
            checked={active}
            readOnly={readOnly || !target}
            ariaLabel={field.label}
            onChange={(checked) => {
              if (!checked) {
                clearField(field)
                return
              }
              const defaultVal = field.enumValues?.[0]?.value
              setFieldBinding(field, {
                value:
                  allowAbsoluteValue && !polarity
                    ? defaultVal
                    : polarity
                      ? polarity.onValue
                      : undefined,
              })
            }}
          />
          {active && !polarity && !allowAbsoluteValue ? (
            <span className="card-hint">
              Use a dropdown Parameter control to set enum values, or leave Presence-only.
            </span>
          ) : null}
        </div>
      )
    }

    return (
      <div key={field.key} className="l2-param-bind-member">
        <ToggleRow
          label={field.label}
          checked={active}
          readOnly={readOnly || !target}
          ariaLabel={field.label}
          onChange={(checked) => {
            if (!checked) {
              clearField(field)
              return
            }
            setFieldBinding(field, { value: true })
          }}
        />
        {active && !allowAbsoluteValue ? (
          <WhenControlOnSelect
            readOnly={readOnly}
            value={existing?.value === false || existing?.value === 'false' ? 'off' : 'on'}
            {...memberArrayWhenOnLabels(field)}
            onChange={(whenOn) => setFieldBinding(field, { value: whenOn === 'on' })}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="l2-param-bind-props">
      {opField || otherSettings.length > 0 || textFields.length === 0 ? (
        <span className="l2-param-bind-props-label">
          {isTextParam ? 'Also control (optional)' : 'Node settings'}
        </span>
      ) : null}

      <div className="l2-param-bind-node-chrome">
        {opField ? renderMatchOp(opField) : null}
        <div className="l2-param-bind-toggles">
          {otherSettings.length === 0 && !opField && target && textFields.length === 0 ? (
            <p className="card-hint">No bindable properties available for this node type.</p>
          ) : null}
          {otherSettings.map((field) => renderSetting(field))}
        </div>
      </div>

      {textFields.length > 0 ? (
        <div className="l2-param-bind-text-section">
          <span className="l2-param-bind-props-label">
            {isTextParam ? 'Write this Param into…' : 'Terms / text lists'}
          </span>
          <div className="l2-param-bind-toggles">
            {textFields.map((field) => {
              const active = nodeBindings.some(
                (b) => b.kind === 'property' && bindingMatchesField(b, field),
              )
              const existing = nodeBindings.find(
                (b) => b.kind === 'property' && bindingMatchesField(b, field),
              )
              const isList = field.valueKind === 'stringList'
              const actionLabel = isTextParam
                ? isList
                  ? `Replace “${field.label}” with this Param’s list`
                  : `Replace “${field.label}” with this Param’s text`
                : `Drive “${field.label}” when toggle is on`

              return (
                <div key={field.key} className="l2-param-bind-text-target">
                  <ToggleRow
                    label={actionLabel}
                    checked={active}
                    readOnly={readOnly || !target}
                    ariaLabel={actionLabel}
                    onChange={(checked) => {
                      if (!checked) {
                        clearField(field)
                        return
                      }
                      const seed = seedFromTargetField(target, field)
                      const listSeed = Array.isArray(seed)
                        ? seed
                        : typeof seed === 'string' && seed
                          ? [seed]
                          : []
                      if (controlType === 'boolean') {
                        setFieldBinding(field, {
                          listMode: 'merge',
                          listValue: isList ? [] : undefined,
                          value: !isList ? '' : undefined,
                        })
                        return
                      }
                      if (controlType === 'enum' && allowAbsoluteValue) {
                        setFieldBinding(field, {
                          listMode: 'replace',
                          listValue: isList ? listSeed : undefined,
                          value: !isList
                            ? typeof seed === 'string'
                              ? seed
                              : ''
                            : undefined,
                        })
                        return
                      }
                      setFieldBinding(field, { listMode: 'replace' })
                      if (
                        seed !== undefined &&
                        isEmptyParamValue(controlLiveValue) &&
                        onSeedControlValue
                      ) {
                        onSeedControlValue(seed)
                      }
                    }}
                  />
                  {active ? (
                    <label className="l2-param-when-on">
                      Apply when ON
                      <select
                        disabled={readOnly}
                        value={existing?.listMode ?? 'merge'}
                        onChange={(e) => {
                          const listMode =
                            e.target.value === 'replace' ? 'replace' : 'merge'
                          setFieldBinding(field, {
                            listMode,
                            listValue: existing?.listValue,
                            value: existing?.value,
                          })
                        }}
                      >
                        <option value="replace">
                          Replace — use Param terms instead of the node’s
                        </option>
                        <option value="merge">Merge — add Param terms onto the node’s</option>
                      </select>
                    </label>
                  ) : null}
                  {active && isTextParam ? (
                    <p className="l2-param-bind-text-active-hint">
                      Connected — edit the {controlType === 'stringList' ? 'list' : 'text'} on this
                      Param control. “{field.label}” on the target is locked.
                    </p>
                  ) : null}
                  {active && controlType === 'boolean' ? (
                    <>
                      <div className="l2-inspector-field">
                        <span className="l2-param-list-section-label">
                          Extra {field.label.toLowerCase()} when toggle is ON
                        </span>
                        {isList ? (
                          <TermListEditor
                            terms={existing?.listValue ?? []}
                            readOnly={readOnly}
                            placeholder="term"
                            itemNoun="term"
                            onChange={(listValue) =>
                              setFieldBinding(field, {
                                listValue,
                                listMode: existing?.listMode ?? 'merge',
                              })
                            }
                          />
                        ) : (
                          <BlurCommitInputLite
                            disabled={readOnly}
                            value={
                              existing?.listValue?.[0] ??
                              (typeof existing?.value === 'string' ? existing.value : '')
                            }
                            placeholder="text when on"
                            onCommit={(text) =>
                              setFieldBinding(field, {
                                listValue: text ? [text] : [],
                                listMode: existing?.listMode ?? 'merge',
                                value: text,
                              })
                            }
                          />
                        )}
                      </div>
                      {(() => {
                        const baseline = seedFromTargetField(target, field)
                        const baseList = Array.isArray(baseline)
                          ? baseline
                          : typeof baseline === 'string' && baseline
                            ? [baseline]
                            : []
                        const extra = existing?.listValue ?? []
                        const mode = existing?.listMode ?? 'merge'
                        const liveOn =
                          controlLiveValue === true ||
                          controlLiveValue === 'true' ||
                          controlLiveValue === undefined
                        const effective = !liveOn
                          ? baseList
                          : mode === 'merge'
                            ? [...baseList, ...extra.filter((t) => !baseList.includes(t))]
                            : extra
                        return (
                          <p className="l2-param-bind-text-active-hint">
                            {liveOn ? 'Toggle ON → live ' : 'Toggle OFF → live '}
                            {field.label}:{' '}
                            {effective.length === 0
                              ? '(empty)'
                              : effective.map((t) => `“${t}”`).join(', ')}
                          </p>
                        )
                      })()}
                      <p className="card-hint">
                        Node keeps its own {field.label.toLowerCase()} (always editable on the
                        node). When this toggle is off, only the node’s list is used.
                      </p>
                    </>
                  ) : null}
                  {active && allowAbsoluteValue && controlType === 'enum' ? (
                    <div className="l2-inspector-field">
                      <span>Value for this option</span>
                      {isList ? (
                        <TermListEditor
                          terms={existing?.listValue ?? []}
                          readOnly={readOnly}
                          placeholder="term"
                          itemNoun="term"
                          onChange={(listValue) =>
                            setFieldBinding(field, {
                              listValue,
                              listMode: existing?.listMode ?? 'replace',
                            })
                          }
                        />
                      ) : (
                        <BlurCommitInputLite
                          disabled={readOnly}
                          value={
                            existing?.listValue?.[0] ??
                            (typeof existing?.value === 'string' ? existing.value : '')
                          }
                          placeholder="text for this option"
                          onCommit={(text) =>
                            setFieldBinding(field, {
                              listValue: text ? [text] : [],
                              listMode: existing?.listMode ?? 'replace',
                              value: text,
                            })
                          }
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
