import React from 'react';
import { Eye, EyeOff, Columns } from 'lucide-react';

export interface Column {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnVisibilityMenuProps {
  columns: Column[];
  onChange: (columns: Column[]) => void;
}

export default function ColumnVisibilityMenu({ columns, onChange }: ColumnVisibilityMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = (columnId: string) => {
    const updatedColumns = columns.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    );
    onChange(updatedColumns);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 hover:text-gray-800 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
        title="Mostrar/Ocultar Columnas"
      >
        <Columns className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg z-50">
          <div className="p-2 border-b">
            <h3 className="text-sm font-medium text-gray-700">Columnas Visibles</h3>
          </div>
          <div className="p-2 max-h-96 overflow-y-auto">
            {columns.map(column => (
              <button
                key={column.id}
                onClick={() => toggleColumn(column.id)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              >
                <span>{column.label}</span>
                {column.visible ? (
                  <Eye className="w-4 h-4 text-indigo-600" />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}