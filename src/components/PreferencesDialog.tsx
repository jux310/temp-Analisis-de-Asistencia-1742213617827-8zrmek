import React from 'react';
import { Settings, X } from 'lucide-react';
import { PreferencesConfig, Schedule } from '../types';

interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: PreferencesConfig;
  onSave: (newPreferences: PreferencesConfig) => void;
}

function TimeInput({ label, value, onChange }: { 
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  const hours = Math.floor((value || 0) / 60);
  const minutes = (value || 0) % 60;

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-700 min-w-32">{label}</label>
      <input
        type="number"
        min="0"
        max="23"
        value={hours}
        onChange={(e) => onChange((parseInt(e.target.value) || 0) * 60 + minutes)}
        className="w-16 px-2 py-1 border rounded"
      />
      <span>:</span>
      <input
        type="number"
        min="0"
        max="59"
        value={minutes}
        onChange={(e) => onChange(hours * 60 + (parseInt(e.target.value) || 0))}
        className="w-16 px-2 py-1 border rounded"
      />
    </div>
  );
}

function ScheduleSection({ title, schedule, onChange }: {
  title: string;
  schedule: Schedule;
  onChange: (newSchedule: Schedule) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-gray-900">{title}</h3>
      <TimeInput
        label="Hora de entrada"
        value={schedule.startTime}
        onChange={(minutes) => onChange({ ...schedule, startTime: minutes })}
      />
      <TimeInput
        label="Hora de salida"
        value={schedule.endTime}
        onChange={(minutes) => onChange({ ...schedule, endTime: minutes })}
      />
      <TimeInput
        label="Inicio almuerzo"
        value={schedule.lunchStart}
        onChange={(minutes) => onChange({ ...schedule, lunchStart: minutes })}
      />
      <TimeInput
        label="Fin almuerzo"
        value={schedule.lunchEnd}
        onChange={(minutes) => onChange({ ...schedule, lunchEnd: minutes })}
      />
    </div>
  );
}

export default function PreferencesDialog({ 
  isOpen, 
  onClose, 
  preferences,
  onSave 
}: PreferencesDialogProps) {
  const [localPreferences, setLocalPreferences] = React.useState(preferences);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">Preferencias</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ScheduleSection
              title="Horario Regular"
              schedule={localPreferences.regularSchedule}
              onChange={(newSchedule) => setLocalPreferences({
                ...localPreferences,
                regularSchedule: newSchedule
              })}
            />
            
            <ScheduleSection
              title="Horario Temprano"
              schedule={localPreferences.earlySchedule}
              onChange={(newSchedule) => setLocalPreferences({
                ...localPreferences,
                earlySchedule: newSchedule
              })}
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Configuración General</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700">
                  Umbral de duplicados (minutos)
                </label>
                <input
                  type="number"
                  min="1"
                  value={localPreferences.duplicateThresholdMinutes || 5}
                  onChange={(e) => setLocalPreferences({
                    ...localPreferences,
                    duplicateThresholdMinutes: parseInt(e.target.value) || 5
                  })}
                  className="mt-1 w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700">
                  Duración almuerzo (minutos)
                </label>
                <input
                  type="number"
                  min="1"
                  value={localPreferences.lunchDuration || 60}
                  onChange={(e) => setLocalPreferences({
                    ...localPreferences,
                    lunchDuration: parseInt(e.target.value) || 60
                  })}
                  className="mt-1 w-full px-3 py-2 border rounded"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={localPreferences.showAllDays}
                  onChange={(e) => setLocalPreferences({
                    ...localPreferences,
                    showAllDays: e.target.checked
                  })}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">
                  Mostrar todos los días del mes (incluso sin registros)
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium text-gray-800">Umbrales de Horas Extra</h4>
                <div>
                  <label className="block text-sm text-gray-700">
                    Minutos para media hora
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={localPreferences.overtimeThresholds?.halfHour || 25}
                    onChange={(e) => setLocalPreferences({
                      ...localPreferences,
                      overtimeThresholds: {
                        ...localPreferences.overtimeThresholds,
                        halfHour: parseInt(e.target.value) || 25
                      }
                    })}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">
                    Minutos para hora completa
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={localPreferences.overtimeThresholds?.fullHour || 55}
                    onChange={(e) => setLocalPreferences({
                      ...localPreferences,
                      overtimeThresholds: {
                        ...localPreferences.overtimeThresholds,
                        fullHour: parseInt(e.target.value) || 55
                      }
                    })}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-gray-800">Umbrales de Tardanza</h4>
                <div>
                  <label className="block text-sm text-gray-700">
                    Minutos para media hora
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={localPreferences.lateThresholds?.halfHour || 35}
                    onChange={(e) => setLocalPreferences({
                      ...localPreferences,
                      lateThresholds: {
                        ...localPreferences.lateThresholds,
                        halfHour: parseInt(e.target.value) || 35
                      }
                    })}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">
                    Minutos para hora completa
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={localPreferences.lateThresholds?.fullHour || 35}
                    onChange={(e) => setLocalPreferences({
                      ...localPreferences,
                      lateThresholds: {
                        ...localPreferences.lateThresholds,
                        fullHour: parseInt(e.target.value) || 35
                      }
                    })}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave(localPreferences);
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}