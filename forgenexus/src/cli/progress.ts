/**
 * ASCII Progress Bar — Beautiful console progress visualization for ForgeNexus.
 *
 * Features:
 *   - Multi-phase progress tracking
 *   - Animated spinner for indeterminate phases
 *   - Smooth percentage updates
 *   - Color support (ANSI escape codes)
 *   - Phase timing metadata
 *   - JSON logging mode for CI/scripting
 */

export type Phase = 'scanning' | 'parsing' | 'edges' | 'binding' | 'communities' | 'processes' | 'fts' | 'embeddings' | 'complete'

export interface PhaseInfo {
  label: string
  progress: number
  color?: string
  startTime?: number
  endTime?: number
  durationMs?: number
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  phase?: Phase
  message: string
  durationMs?: number
  metadata?: Record<string, any>
}

const PHASE_COLORS: Record<Phase, string> = {
  scanning: '\x1b[36m',     // cyan
  parsing: '\x1b[35m',      // magenta
  edges: '\x1b[33m',        // yellow
  binding: '\x1b[34m',      // blue
  communities: '\x1b[32m',  // green
  processes: '\x1b[96m',   // bright cyan
  fts: '\x1b[90m',         // gray
  embeddings: '\x1b[35m',  // magenta
  complete: '\x1b[32m',    // green
}

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const PHASE_LABELS: Record<Phase, string> = {
  scanning: 'Scanning files',
  parsing: 'Parsing code',
  edges: 'Resolving edges',
  binding: 'Binding propagation',
  communities: 'Detecting communities',
  processes: 'Tracing execution flows',
  fts: 'Building search index',
  embeddings: 'Generating embeddings',
  complete: 'Index complete',
}

const BAR_WIDTH = 30
const PHASES: Phase[] = ['scanning', 'parsing', 'edges', 'binding', 'communities', 'processes', 'fts', 'embeddings']

/**
 * Structured Logger with timing metadata
 */
export class Logger {
  private entries: LogEntry[] = []
  private verbose: boolean
  private jsonMode: boolean

  constructor(options: { verbose?: boolean; json?: boolean } = {}) {
    this.verbose = options.verbose ?? process.env.FORGENEXUS_VERBOSE === '1'
    this.jsonMode = options.json ?? false
  }

  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  log(level: LogEntry['level'], message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      metadata,
    }

    this.entries.push(entry)

    if (this.jsonMode) {
      console.error(JSON.stringify(entry))
    } else {
      const ts = this.verbose ? `[${entry.timestamp}] ` : ''
      const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : ''

      switch (level) {
        case 'error':
          console.error(`\x1b[31m${ts}ERROR\x1b[0m ${message}${metaStr}`)
          break
        case 'warn':
          console.error(`\x1b[33m${ts}WARN\x1b[0m ${message}${metaStr}`)
          break
        case 'debug':
          if (this.verbose) {
            console.error(`\x1b[90m${ts}DEBUG\x1b[0m ${message}${metaStr}`)
          }
          break
        default:
          console.error(`\x1b[36m${ts}INFO\x1b[0m ${message}${metaStr}`)
      }
    }
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata)
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata)
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata)
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata)
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  getPhaseDurations(): Record<Phase, number | undefined> {
    const durations: Record<Phase, number | undefined> = {} as any
    for (const phase of PHASES) {
      const info = this.phaseInfos?.get(phase)
      if (info?.durationMs) {
        durations[phase] = info.durationMs
      }
    }
    return durations
  }

  // Link to progress bar for duration tracking
  phaseInfos?: Map<Phase, PhaseInfo>
}

export const logger = new Logger()

export class ProgressBar {
  private phases: Map<Phase, PhaseInfo> = new Map()
  private spinnerIndex = 0
  private lastRendered = ''
  private startTime: number
  private currentPhase: Phase = 'scanning'
  private message = ''
  private enabled: boolean
  private useColor: boolean
  private phaseStartTime: number
  private jsonMode: boolean
  private logger: Logger

  constructor(options: { enabled?: boolean; useColor?: boolean; json?: boolean; verbose?: boolean } = {}) {
    this.enabled = options.enabled ?? true
    this.useColor = options.useColor ?? true
    this.jsonMode = options.json ?? false
    this.logger = new Logger({ verbose: options.verbose })
    this.startTime = Date.now()
    this.phaseStartTime = this.startTime

    for (const phase of PHASES) {
      this.phases.set(phase, { label: PHASE_LABELS[phase], progress: 0 })
    }
    this.phases.set('complete', { label: PHASE_LABELS['complete'], progress: 0 })

    // Link logger to progress bar
    this.logger.phaseInfos = this.phases
  }

  update(phase: Phase, pct: number, message?: string): void {
    if (!this.enabled) return

    const phaseInfo = this.phases.get(phase)
    if (!phaseInfo) return

    // Track phase transitions for timing
    if (phase !== this.currentPhase && this.currentPhase !== phase) {
      // Phase changed - record duration of previous phase
      const prevInfo = this.phases.get(this.currentPhase)
      if (prevInfo && prevInfo.startTime) {
        prevInfo.endTime = Date.now()
        prevInfo.durationMs = prevInfo.endTime - prevInfo.startTime
      }
      // Start new phase
      phaseInfo.startTime = Date.now()
      this.phaseStartTime = phaseInfo.startTime
    }

    phaseInfo.progress = Math.min(100, Math.max(0, pct))
    this.currentPhase = phase

    // Clean message: remove phase prefix like "[scanning] 0%"
    // and don't use if it matches the phase label
    if (message) {
      const cleanMsg = message.replace(/^\[\w+\]\s*\d+%\s*/, '').trim()
      if (cleanMsg && cleanMsg !== PHASE_LABELS[phase]) {
        this.message = cleanMsg
      } else {
        this.message = ''
      }
    } else {
      this.message = ''
    }

    this.render()

    // Log phase completion
    if (this.jsonMode && pct >= 100) {
      this.logger.info(`${phase}:complete`, {
        phase,
        durationMs: phaseInfo.durationMs,
      })
    }
  }

  getPhaseDurations(): Record<Phase, number | undefined> {
    const durations: Record<Phase, number | undefined> = {} as any
    for (const phase of PHASES) {
      const info = this.phases.get(phase)
      if (info?.durationMs) {
        durations[phase] = info.durationMs
      }
    }
    return durations
  }

  private getColor(phase: Phase): string {
    return this.useColor ? PHASE_COLORS[phase] : ''
  }

  private buildBar(pct: number): string {
    const filled = Math.round((pct / 100) * BAR_WIDTH)
    const empty = BAR_WIDTH - filled

    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    return bar
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60

    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  private spin(): string {
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_CHARS.length
    return SPINNER_CHARS[this.spinnerIndex]
  }

  private calculateOverallProgress(): number {
    let total = 0
    let weight = 0

    for (const phase of PHASES) {
      const info = this.phases.get(phase)
      if (info && info.progress > 0) {
        total += info.progress
        weight++
      }
    }

    if (weight === 0) return 0

    const baseProgress = total / weight
    const phaseIndex = PHASES.indexOf(this.currentPhase)
    const currentContribution = (phaseIndex / PHASES.length) * 100
    const phaseContribution = (baseProgress / 100) * (1 / PHASES.length) * 100

    return Math.min(99, Math.round(currentContribution + phaseContribution))
  }

  render(): void {
    if (!this.enabled) return

    const elapsed = Date.now() - this.startTime
    const elapsedStr = this.formatTime(elapsed)
    const spinner = this.spin()

    // Build phase list
    const phaseLines: string[] = []
    let completedCount = 0

    for (const phase of PHASES) {
      const info = this.phases.get(phase)!
      const isActive = phase === this.currentPhase
      const isComplete = info.progress >= 100
      const color = this.getColor(phase)

      if (isComplete) completedCount++

      const prefix = isComplete ? '✓' : isActive ? spinner : ' '
      const bar = this.buildBar(info.progress)
      const pct = `${info.progress}%`.padStart(4)
      const label = info.label.padEnd(22)

      if (isActive && !isComplete) {
        const status = this.message ? ` ${this.message}` : ''
        phaseLines.push(`${color}${prefix} [${bar}] ${pct} ${BOLD}${label}${RESET}${color}${status}${RESET}`)
      } else if (isComplete) {
        phaseLines.push(`${this.getColor('complete')}✓ [${bar}] ${pct} ${label}${RESET}`)
      } else {
        phaseLines.push(`${DIM}${prefix} [${bar}] ${pct} ${label}${RESET}`)
      }
    }

    const overall = this.calculateOverallProgress()
    const overallBar = this.buildBar(overall)

    // Header
    const header = `\n${BOLD}${this.getColor('scanning')}╔══════════════════════════════════════════════════════════╗${RESET}\n` +
      `${BOLD}${this.getColor('scanning')}║${RESET}  ${BOLD}ForgeNexus${RESET} ${DIM}Code Intelligence${RESET}                          ${BOLD}${this.getColor('scanning')}║${RESET}\n` +
      `${BOLD}${this.getColor('scanning')}╚══════════════════════════════════════════════════════════╝${RESET}`

    // Progress section
    const progressSection = phaseLines.map((l) => `  ${l}`).join('\n')

    // Footer with overall progress
    const overallPct = `${overall}%`.padStart(3)
    const footer = `\n${DIM}  Overall:${RESET} ${BOLD}[${overallBar}]${RESET} ${overallPct}% ${DIM}(${elapsedStr})${RESET}`

    const output = `${header}\n${progressSection}${footer}\n`

    // Save cursor position, clear from cursor to end, redraw
    if (this.lastRendered) {
      const lines = this.lastRendered.split('\n').length
      process.stderr.write(`\x1b[${lines}A`)
      process.stderr.write('\x1b[J')
    } else {
      // First render - just print
    }

    process.stderr.write(output)
    this.lastRendered = output
  }

  complete(): void {
    if (!this.enabled) return

    // Mark all phases complete
    for (const phase of PHASES) {
      this.phases.get(phase)!.progress = 100
    }
    this.phases.get('complete')!.progress = 100

    // Clear previous render
    if (this.lastRendered) {
      const lines = this.lastRendered.split('\n').length
      process.stderr.write(`\x1b[${lines}A`)
      process.stderr.write('\x1b[J')
    }

    const elapsed = Date.now() - this.startTime
    const elapsedStr = this.formatTime(elapsed)

    // Final summary
    const summary = `
${BOLD}${this.getColor('complete')}╔══════════════════════════════════════════════════════════╗${RESET}
${BOLD}${this.getColor('complete')}║${RESET}  ${BOLD}${this.getColor('complete')}✓ Index Complete${RESET}                                      ${BOLD}${this.getColor('complete')}║${RESET}
${BOLD}${this.getColor('complete')}╚══════════════════════════════════════════════════════════╝${RESET}

${this.getColor('complete')}  All phases complete in ${BOLD}${elapsedStr}${RESET}${this.getColor('complete')}.${RESET}
`

    process.stderr.write(summary)
    this.lastRendered = ''
  }

  clear(): void {
    if (!this.enabled || !this.lastRendered) return

    const lines = this.lastRendered.split('\n').length
    process.stderr.write(`\x1b[${lines}A`)
    process.stderr.write('\x1b[J')
    this.lastRendered = ''
  }
}

/**
 * Create a progress callback for use with Indexer.analyze()
 */
export function createProgressCallback(enabled = true): (phase: Phase, pct: number, message?: string) => void {
  const bar = new ProgressBar({ enabled })

  return (phase: Phase, pct: number, message?: string) => {
    bar.update(phase, pct, message)
    if (phase === 'complete') {
      bar.complete()
    }
  }
}
