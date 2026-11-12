/**
 * Settings — theme, session preferences, optional gamification toggles,
 * FSRS retention target, and data management (export/import/reset).
 */
import { useRef, useState } from 'react';
import type { AppSettings } from '@french-daily/learning-core';
import { Button, Card, Screen, SectionTitle, Segmented, Toggle } from '../components/ui';
import { useApp } from '../hooks/useApp';
import { exportProgress, exportRecoverySnapshot, downloadBackup, importProgress, resetProgress } from '../storage/backup';

export function SettingsScreen() {
  const { settings, updateSettings, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!settings) {
    return (
      <Screen>
        <div className="text-muted text-[15px] py-10 text-center">Loading settings…</div>
      </Screen>
    );
  }

  const set = (patch: Partial<AppSettings>) => void updateSettings(patch);

  const onExport = async () => {
    const backup = await exportProgress();
    downloadBackup(backup);
    toast('Backup downloaded', 'success');
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importProgress(text);
      if (result.ok) {
        toast(
          `Restored ${result.restored?.reviews ?? 0} review states and ${result.restored?.attempts ?? 0} attempts`,
          'success',
        );
        window.location.reload();
      } else {
        toast(result.error ?? 'Import failed', 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  const onReset = async () => {
    await resetProgress(false);
    setConfirmReset(false);
    toast('Learning progress reset. Settings kept.', 'success');
    window.location.reload();
  };

  return (
    <Screen>
      <SectionTitle level={1}>Settings</SectionTitle>

      {/* Appearance */}
      <Card className="p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Appearance</div>
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Card>

      {/* Learning */}
      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Learning</div>
        <Segmented
          label="Default session size"
          value={settings.sessionSize}
          onChange={(v) => set({ sessionSize: v })}
          options={[
            { value: 'short', label: 'Short (9)' },
            { value: 'standard', label: 'Standard (15)' },
            { value: 'long', label: 'Long (21)' },
          ]}
        />
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-medium text-ink">FSRS retention target</div>
              <div className="text-[13px] text-muted">
                Higher = reviews come sooner. 90% is the recommended default.
              </div>
            </div>
            <div className="text-[17px] font-bold text-accent tabular-nums">{Math.round(settings.desiredRetention * 100)}%</div>
          </div>
          <input
            type="range"
            min={80}
            max={95}
            step={1}
            value={Math.round(settings.desiredRetention * 100)}
            onChange={(e) => set({ desiredRetention: Number(e.target.value) / 100 })}
            aria-label="Desired retention"
            className="mt-2 w-full accent-[var(--fd-accent)]"
          />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-medium text-ink">Daily goal</div>
              <div className="text-[13px] text-muted">Minutes of practice per day (a target, never a demand).</div>
            </div>
            <div className="text-[17px] font-bold text-ink tabular-nums">{settings.dailyGoalMinutes} min</div>
          </div>
          <input
            type="range"
            min={2}
            max={45}
            step={1}
            value={settings.dailyGoalMinutes}
            onChange={(e) => set({ dailyGoalMinutes: Number(e.target.value) })}
            aria-label="Daily goal minutes"
            className="mt-2 w-full accent-[var(--fd-accent)]"
          />
        </div>
      </Card>

      {/* Gamification — all optional */}
      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-1">Feedback & gamification</div>
        <div className="text-[12px] text-muted mb-2">Everything here can be turned off. No feature punishes you.</div>
        <div className="divide-y divide-[var(--fd-border)]">
          <Toggle
            label="Sound effects"
            description="Subtle tones for correct/incorrect answers."
            checked={settings.soundEnabled}
            onChange={(v) => set({ soundEnabled: v })}
          />
          <Toggle
            label="Haptic feedback"
            description="Gentle vibrations on supported devices."
            checked={settings.hapticsEnabled}
            onChange={(v) => set({ hapticsEnabled: v })}
          />
          <Toggle
            label="Pronunciation playback"
            description="Hear French words using your device's voice."
            checked={settings.pronunciationEnabled}
            onChange={(v) => set({ pronunciationEnabled: v })}
          />
          <Toggle
            label="Milestone celebrations"
            description="A quiet note when you reach a learning milestone."
            checked={settings.celebrationsEnabled}
            onChange={(v) => set({ celebrationsEnabled: v })}
          />
          <Toggle
            label="Daily streaks"
            description="Track consecutive practice days. Never resets with shame — pause anytime."
            checked={settings.streaksEnabled}
            onChange={(v) => set({ streaksEnabled: v })}
          />
          <p className="py-3 text-sm text-muted">Scheduled reminders are not available in this offline edition.</p>
        </div>
      </Card>

      {/* Data */}
      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Your data</div>
        <p className="text-[13px] text-muted">
          Everything stays in your browser (IndexedDB). GitHub verifies access; learning history never leaves this device. No analytics. Export a backup to move
          your progress between devices.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="secondary" onClick={onExport}>
            Export progress (JSON)
          </Button>
          <Button variant="secondary" onClick={async () => {
            const snapshot = await exportRecoverySnapshot();
            if (snapshot) downloadBackup(snapshot); else toast('No upgrade or restore snapshot exists yet.');
          }}>Export safety snapshot</Button>
          <Button variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? 'Importing…' : 'Import progress'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
          {!confirmReset ? (
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              Reset learning progress…
            </Button>
          ) : (
            <div className="rounded-xl border border-bad/40 bg-badsoft p-3">
              <div className="text-[14px] font-semibold text-bad">Reset all learning progress?</div>
              <div className="text-[12.5px] text-muted mt-0.5">
                Attempts, review states, sessions and milestones will be deleted. Settings are kept. This cannot be undone —
                export a backup first if unsure.
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button variant="secondary" className="flex-1 !py-2" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
                <Button variant="danger" className="flex-1 !py-2" onClick={onReset}>
                  Yes, reset
                </Button>
              </div>
            </div>
          )}
        </div>
        {settings.lastExportAt && (
          <div className="mt-2 text-[11.5px] text-muted">Last export: {new Date(settings.lastExportAt).toLocaleString()}</div>
        )}
      </Card>

      {/* About */}
      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">About</div>
        <div className="text-[13px] text-muted leading-relaxed">
          French Daily · a local-first French learning PWA.
          <br />
          Scheduling: FSRS-4.5 (open-source algorithm). Content: {''}
          <a className="text-accent underline" href="https://github.com/open-spaced-repetition/fsrs4anki" target="_blank" rel="noreferrer">
            FSRS research
          </a>{' '}
          and curated A1–B1 material. Works fully offline once loaded.
        </div>
      </Card>
    </Screen>
  );
}
