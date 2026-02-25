import { useEffect } from "react";
import Dashboard from "./components/Dashboard";
import { useSettingsStore } from "./store/settingsStore";

export default function App() {
  const { load } = useSettingsStore();

  useEffect(() => {
    load();
  }, [load]);

  return <Dashboard />;
}
