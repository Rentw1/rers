import { createContext, useContext, type ReactNode } from 'react';
import { api } from './api';

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export type Decision = 'once' | 'always' | 'deny';
export const DecideContext = createContext<(callId: string, d: Decision) => void>((callId, d) => void api.invoke('approval:decide', callId, d));
export const useDecide = () => useContext(DecideContext);

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Row({ title, sub, children, onClick }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`row${onClick ? ' click' : ''}`} onClick={onClick}>
      <div className="grow">
        <div>{title}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title ? <div className="section-title">{title}</div> : null}
      <div className="section">{children}</div>
    </>
  );
}
