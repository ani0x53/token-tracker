import { useState } from "react";
import { Bell, X } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

interface AlertSettingsProps {
  onClose: () => void;
}

export default function AlertSettings({ onClose }: AlertSettingsProps) {
  const { settings, save } = useSettingsStore();
  const [form, setForm] = useState({
    anthropic_key: settings.anthropic_key,
    openai_key: settings.openai_key,
    poll_interval_secs: settings.poll_interval_secs,
    alert_daily_usd: settings.alert_daily_usd,
    alert_monthly_usd: settings.alert_monthly_usd,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await save(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function field(
    label: string,
    key: keyof typeof form,
    placeholder?: string,
    type = "text",
  ) {
    return (
      <div>
        <label className="block text-sm text-gray-400 mb-1">{label}</label>
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-indigo-400" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              API Keys
            </h3>
            <div className="space-y-3">
              {field(
                "Anthropic Admin Key",
                "anthropic_key",
                "sk-ant-admin-...",
                "password",
              )}
              {field("OpenAI API Key", "openai_key", "sk-...", "password")}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Polling
            </h3>
            {field(
              "Poll Interval (seconds)",
              "poll_interval_secs",
              "300",
              "number",
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Spending Alerts
            </h3>
            <div className="space-y-3">
              {field("Daily Alert Threshold ($)", "alert_daily_usd", "10.00", "number")}
              {field(
                "Monthly Alert Threshold ($)",
                "alert_monthly_usd",
                "100.00",
                "number",
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saved ? "Saved!" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
