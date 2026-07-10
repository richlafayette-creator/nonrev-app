import { existsSync } from 'node:fs'

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error
    if (/\.[cm]?[jt]sx?$/.test(specifier)) throw error
    const base = specifier.startsWith('/') ? new URL(`file://${specifier}`) : new URL(specifier, context.parentURL)
    const tsUrl = new URL(`${base.pathname}.ts`, base)
    if (existsSync(tsUrl)) return { url: tsUrl.href, shortCircuit: true }
    const tsxUrl = new URL(`${base.pathname}.tsx`, base)
    if (existsSync(tsxUrl)) return { url: tsxUrl.href, shortCircuit: true }
    const indexTsUrl = new URL(`${base.pathname}/index.ts`, base)
    if (existsSync(indexTsUrl)) return { url: indexTsUrl.href, shortCircuit: true }
    throw error
  }
}
