import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualTableProps<T> {
  data: T[];
  columns: {
    header: string;
    key: string;
    width?: string;
    align?: 'left' | 'right' | 'center';
    render: (item: T) => React.ReactNode;
  }[];
  rowHeight?: number;
  containerHeight?: string;
}

export function VirtualTable<T>({ 
  data, 
  columns, 
  rowHeight = 65, 
  containerHeight = '400px' 
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      {/* Fixed Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-divider)', color: 'var(--text-secondary)', fontSize: '0.85rem', paddingRight: '12px' /* align with scrollbar */ }}>
        {columns.map((col, idx) => (
          <div key={idx} style={{ 
            flex: col.width ? `0 0 ${col.width}` : 1, 
            padding: '1rem 0', 
            fontWeight: 500,
            textAlign: col.align || 'left'
          }}>
            {col.header}
          </div>
        ))}
      </div>

      {/* Scrollable Body */}
      <div 
        ref={parentRef}
        style={{
          height: containerHeight,
          overflowY: 'auto',
          contain: 'strict',
          width: '100%',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className="hover-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-divider)',
                  transition: 'background-color 0.2s',
                }}
              >
                {columns.map((col, idx) => (
                  <div key={idx} style={{ 
                    flex: col.width ? `0 0 ${col.width}` : 1, 
                    textAlign: col.align || 'left',
                    padding: '0 0.5rem' // Ensure some spacing
                  }}>
                    {col.render(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <style>
        {`
          .hover-row {
            border-left: 2px solid transparent;
            transition: all 0.2s ease;
          }
          .hover-row:hover {
            background-color: rgba(201, 168, 76, 0.08);
            border-left: 2px solid var(--accent-gold);
            box-shadow: inset 40px 0 60px -30px rgba(201, 168, 76, 0.4),
                        inset 0 0 10px rgba(201, 168, 76, 0.05);
            z-index: 10;
          }
          @media (prefers-reduced-motion: reduce) {
            .hover-row {
              transition: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}
