import { useState, useRef, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizablePanelProps {
  topPanel: ReactNode;
  bottomPanel: ReactNode;
  initialTopPercent?: number;
  minTopPercent?: number;
  minBottomPercent?: number;
}

export function ResizablePanel({
  topPanel,
  bottomPanel,
  initialTopPercent = 40,
  minTopPercent = 20,
  minBottomPercent = 30,
}: ResizablePanelProps) {
  const [topPercent, setTopPercent] = useState(initialTopPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const startY = e.clientY;
    const startPercent = topPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = startPercent + deltaPercent;

      const maxTopPercent = 100 - minBottomPercent;
      const clampedPercent = Math.max(minTopPercent, Math.min(newPercent, maxTopPercent));
      setTopPercent(clampedPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div ref={containerRef} className="relative h-full flex flex-col">
      <div style={{ height: `${topPercent}%` }} className="flex-shrink-0 flex flex-col">
        {topPanel}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={`
          relative h-3 flex-shrink-0 cursor-ns-resize
          flex items-center justify-center group
          ${isDragging ? 'bg-blue-500' : 'bg-slate-100 hover:bg-blue-400'}
          transition-colors
        `}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <GripVertical className={`w-5 h-5 rotate-90 ${isDragging ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col">
        {bottomPanel}
      </div>
    </div>
  );
}
