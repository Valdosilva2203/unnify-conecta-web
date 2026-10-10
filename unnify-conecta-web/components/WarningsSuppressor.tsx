'use client';

import { useEffect } from 'react';

export function WarningsSuppressor() {
  useEffect(() => {
    const originalWarn = console.warn;

    console.warn = function(...args: any[]) {
      const message = args[0]?.toString() || '';

      // Suppress MaxListenersExceededWarning
      if (message.includes('MaxListenersExceeded')) return;

      // Suppress ObjectMultiplex warnings
      if (message.includes('ObjectMultiplex')) return;
      if (message.includes('orphaned data')) return;

      // Call original warn for other messages
      originalWarn.apply(console, args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
