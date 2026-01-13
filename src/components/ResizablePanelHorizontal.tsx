import { useState, useRef, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizablePanelHorizontalProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  initialLeftPercent?: number;
  minLeftPercent?: number;
  minRightPercent?: number;
}

export function ResizablePanelHorizontal({
  leftPanel,
  rightPanel,
  initialLeftPercent = 33,
  minLeftPercent = 20,
  minRightPercent = 25,
}: ResizablePanelHorizontalProps) {
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const startPercent = leftPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newPercent = startPercent + deltaPercent;

      const maxLeftPercent = 100 - minRightPercent;
      const clampedPercent = Math.max(minLeftPercent, Math.min(newPercent, maxLeftPercent));
      setLeftPercent(clampedPercent);
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
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div ref={containerRef} className="relative flex flex-row" style={{ minHeight: '600px' }}>
      <div style={{ width: `${leftPercent}%` }} className="flex-shrink-0 flex flex-col">
        {leftPanel}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={`
          relative w-3 flex-shrink-0 cursor-ew-resize
          flex items-center justify-center group
          ${isDragging ? 'bg-blue-500' : 'bg-slate-100 hover:bg-blue-400'}
          transition-colors
        `}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <GripVertical className={`w-5 h-5 ${isDragging ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {rightPanel}
      </div>
    </div>
  );
}
