import { useEffect } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "../store/settingsStore";
import { useUsageData } from "./useUsageData";

export function useAlerts() {
  const { settings } = useSettingsStore();
  const { todayAnthropicCost, todayOpenaiCost } = useUsageData();

  const todayTotal = todayAnthropicCost + todayOpenaiCost;

  useEffect(() => {
    async function checkAlerts() {
      const threshold = parseFloat(settings.alert_daily_usd);
      if (!threshold || threshold <= 0) return;
      if (todayTotal < threshold) return;

      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }

      if (granted) {
        sendNotification({
          title: "Token Tracker — Spending Alert",
          body: `Today's API spend $${todayTotal.toFixed(2)} has reached your $${threshold.toFixed(2)} daily threshold.`,
        });
      }
    }

    checkAlerts();
  }, [todayTotal, settings.alert_daily_usd]);
}
