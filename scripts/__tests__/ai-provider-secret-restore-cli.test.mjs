import {
  main,
  parseAiProviderSecretRestoreArgs,
  verifyAiProviderSecretRestoreInPages,
} from '../ai-provider-secret-restore-cli.mjs'

describe('AI provider-secret restore CLI', () => {
  it('parses bounded paging and omission flags', () => {
    expect(parseAiProviderSecretRestoreArgs([])).toEqual({
      batchSize: 100,
      omitRootKeyVersion: undefined,
    })
    expect(
      parseAiProviderSecretRestoreArgs([
        '--omit-root-key-version',
        'root-1',
        '--batch-size',
        '250',
      ]),
    ).toEqual({ batchSize: 250, omitRootKeyVersion: 'root-1' })
    for (const args of [
      ['--batch-size'],
      ['--batch-size', '0'],
      ['--batch-size', '1001'],
      ['--batch-size', '1.5'],
      ['--unknown', 'value'],
      ['--omit-root-key-version', ''],
    ]) {
      expect(() => parseAiProviderSecretRestoreArgs(args)).toThrow()
    }
  })

  it('forwards the batch through the packaged connection boundary', async () => {
    const dataSource = { query: vi.fn() }
    const keyring = { activeWriteVersion: 'root-2' }
    const loadKeyringImpl = vi.fn(() => keyring)
    const verifyRestoreImpl = vi.fn(async () => ({ compatible: true }))
    const verifyConnectionImpl = vi.fn(async (_connection, options) => {
      const loaded =
        options.providerSecretMaintenanceModule.loadAiProviderSecretMaintenanceKeyring()
      return options.providerSecretMaintenanceModule.verifyAiProviderSecretRestoreSet(
        dataSource,
        loaded,
        { omitRootKeyVersion: options.omitRootKeyVersion },
      )
    })

    await expect(
      verifyAiProviderSecretRestoreInPages('mssql://restored', {
        batchSize: 250,
        env: {},
        loadKeyringImpl,
        omitRootKeyVersion: 'root-1',
        verifyConnectionImpl,
        verifyRestoreImpl,
      }),
    ).resolves.toEqual({ compatible: true })
    expect(verifyRestoreImpl).toHaveBeenCalledWith(dataSource, keyring, {
      batchSize: 250,
      omitRootKeyVersion: 'root-1',
    })
  })

  it('prints bounded aggregate evidence and returns a compatibility status', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const report = {
      checkedSecretVersionCount: 25,
      compatible: true,
      safeToRemoveOmittedRootKeyVersion: true,
    }
    const verifyConnectionImpl = vi.fn(async () => report)
    const dependencies = {
      consoleObj,
      env: {},
      getDatabaseUrlImpl: vi.fn(() => 'mssql://restored'),
      verifyConnectionImpl,
    }

    await expect(main(['--batch-size', '10'], dependencies)).resolves.toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(JSON.stringify(report, null, 2))

    verifyConnectionImpl.mockResolvedValue({
      ...report,
      safeToRemoveOmittedRootKeyVersion: false,
    })
    await expect(main([], dependencies)).resolves.toBe(1)

    verifyConnectionImpl.mockResolvedValue({ ...report, compatible: false })
    await expect(main([], dependencies)).resolves.toBe(1)

    verifyConnectionImpl.mockResolvedValue({
      ...report,
      checkedSecretVersionCount: 0,
    })
    await expect(main([], dependencies)).resolves.toBe(1)
  })

  it('normalizes parsing and verifier failures without leaking details', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    await expect(main(['--batch-size', 'bad'], { consoleObj })).resolves.toBe(1)
    await expect(
      main([], {
        consoleObj,
        env: {},
        getDatabaseUrlImpl: () => 'mssql://restored',
        verifyConnectionImpl: async () => {
          throw new Error('plaintext-secret')
        },
      }),
    ).resolves.toBe(1)
    expect(JSON.stringify(consoleObj.error.mock.calls)).not.toContain(
      'plaintext-secret',
    )
    expect(consoleObj.log).not.toHaveBeenCalled()
  })
})
