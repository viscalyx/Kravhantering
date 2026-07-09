'use client'

import {
  Badge,
  Card,
  Flex,
  SegmentedControl,
  Text,
  Theme,
} from '@radix-ui/themes'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export type RadixPrototypeMode = 'local' | 'themes'

const RADIX_PROTOTYPE_MODE_STORAGE_KEY = 'requirements.radixPrototype.mode.v1'
const RADIX_PROTOTYPE_MODE_EVENT = 'requirements:radix-prototype-mode-change'

function readStoredRadixPrototypeMode(): RadixPrototypeMode {
  if (typeof window === 'undefined') {
    return 'local'
  }

  return localStorage.getItem(RADIX_PROTOTYPE_MODE_STORAGE_KEY) === 'themes'
    ? 'themes'
    : 'local'
}

function writeStoredRadixPrototypeMode(mode: RadixPrototypeMode) {
  localStorage.setItem(RADIX_PROTOTYPE_MODE_STORAGE_KEY, mode)
  window.dispatchEvent(
    new CustomEvent<RadixPrototypeMode>(RADIX_PROTOTYPE_MODE_EVENT, {
      detail: mode,
    }),
  )
}

export function useRadixPrototypeMode() {
  const [mode, setModeState] = useState<RadixPrototypeMode>('local')

  useEffect(() => {
    setModeState(readStoredRadixPrototypeMode())

    const syncMode = () => {
      setModeState(readStoredRadixPrototypeMode())
    }

    window.addEventListener('storage', syncMode)
    window.addEventListener(RADIX_PROTOTYPE_MODE_EVENT, syncMode)

    return () => {
      window.removeEventListener('storage', syncMode)
      window.removeEventListener(RADIX_PROTOTYPE_MODE_EVENT, syncMode)
    }
  }, [])

  const setMode = useCallback((nextMode: RadixPrototypeMode) => {
    setModeState(nextMode)
    writeStoredRadixPrototypeMode(nextMode)
  }, [])

  return { mode, setMode }
}

export function RadixPrototypeModeSwitch() {
  const t = useTranslations('radixPrototype')
  const { mode, setMode } = useRadixPrototypeMode()

  return (
    <div
      className="fixed bottom-4 right-4 z-90 max-w-[calc(100vw-2rem)]"
      data-radix-prototype-switch="true"
    >
      <Theme
        accentColor="iris"
        appearance="inherit"
        className="contents"
        grayColor="slate"
        hasBackground={false}
        panelBackground="solid"
        radius="large"
        scaling="100%"
      >
        <Card
          className="shadow-[0_18px_60px_-28px_rgba(15,23,42,0.7)]"
          size="2"
          variant="classic"
          {...devMarker({
            context: 'requirements table',
            name: 'prototype switch',
            priority: 360,
            value: mode,
          })}
        >
          <Flex align="center" gap="3" wrap="wrap">
            <Flex align="center" gap="2">
              <Badge color={mode === 'themes' ? 'iris' : 'gray'} variant="soft">
                {t('badge')}
              </Badge>
              <Text as="label" size="2" weight="medium">
                {t('label')}
              </Text>
            </Flex>
            <SegmentedControl.Root
              aria-label={t('label')}
              onValueChange={value => {
                if (value === 'local' || value === 'themes') {
                  setMode(value)
                }
              }}
              value={mode}
            >
              <SegmentedControl.Item value="local">
                {t('local')}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="themes">
                {t('themes')}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        </Card>
      </Theme>
    </div>
  )
}
