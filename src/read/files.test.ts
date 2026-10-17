import { describe, expect, it } from 'vitest'
import { fileType, formatBytes } from './files'

describe('formatBytes', () => {
  it('reads like a file manager: one decimal under 10, whole numbers above', () => {
    expect(formatBytes(0)).toBe('0 bytes')
    expect(formatBytes(1)).toBe('1 byte')
    expect(formatBytes(1023)).toBe('1023 bytes')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(350 * 1024)).toBe('350 KB')
    expect(formatBytes(1_258_291)).toBe('1.2 MB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3 GB')
  })
})

describe('fileType', () => {
  it('is the extension in capitals, or File without one', () => {
    expect(fileType('assets/2026-10-17-q3-report.xlsx')).toBe('XLSX')
    expect(fileType('assets/archive.tar.gz')).toBe('GZ')
    expect(fileType('assets/Makefile')).toBe('File')
    expect(fileType('assets/.env')).toBe('File')
  })
})
