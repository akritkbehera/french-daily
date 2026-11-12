import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import { db } from '../storage/db';

export function UpdateNotice() {
  const { sessionConfig, toast } = useApp();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) { void registration?.update().catch(() => undefined); },
  });
  const [updating, setUpdating] = useState(false);
  if (!needRefresh || sessionConfig) return null;
  return <aside role="status" className="fixed bottom-24 md:bottom-6 left-4 z-[90] max-w-sm rounded-xl border border-edge bg-surface p-4 text-ink shadow-lg">
    <p className="text-sm">A new French Daily version is ready.</p>
    <button disabled={updating} className="mt-2 font-semibold text-accent" onClick={async () => {
      setUpdating(true);
      try {
        // Wait behind outstanding review transactions before activating/reloading.
        await db.transaction('rw', [db.reviews, db.attempts], async () => { await db.reviews.count(); });
        await updateServiceWorker(true);
      } catch { setUpdating(false); toast('Update could not finish. Your progress is saved.', 'error'); }
    }}>{updating ? 'Updating…' : 'Update now'}</button>
  </aside>;
}
