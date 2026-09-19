"use client";

import ChatBox from "@/components/ChatBox";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function ChatPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <h1 className="text-xl font-bold text-[#0f2044] mb-4">{t("chat.title")}</h1>
      <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 overflow-hidden flex flex-col">
        <ChatBox />
      </div>
    </div>
  );
}
