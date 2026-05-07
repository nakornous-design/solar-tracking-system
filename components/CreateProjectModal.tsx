"use client";

import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void; // ฟังก์ชันรีเฟรชหน้าจอหลังจากสร้างเสร็จ
}

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
    const [formData, setFormData] = useState({
        customerCode: "",
        customerName: "",
        templateId: "", // (ในอนาคตสามารถดึงจาก workflow_templates มาทำ Dropdown ได้)
        standardId: "V8R2",
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [templates, setTemplates] = useState<Array<{ id: string; name?: string; template_name?: string }>>([]);

    const fetchTemplates = useCallback(async () => {
        const { data } = await supabase
            .from('workflow_templates')
            .select('id,name,template_name');

        if (data && data.length > 0) {
            setTemplates(data);
            // ถ้าดึงข้อมูลมาได้ และยังไม่ได้เลือก Template ให้เลือกตัวแรกเป็นค่าเริ่มต้น
            setFormData((prev) => ({ ...prev, templateId: prev.templateId || data[0].id }));
        }
    }, []);

        if (isOpen && templates.length === 0) {
        void fetchTemplates();
    }

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        try {
            // 1. ยิง API สร้าง Project & กาง Milestone อัตโนมัติ
            const projectRes = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const projectData = await projectRes.json();
            if (!projectRes.ok) throw new Error(projectData.error || "สร้างโปรเจกต์ไม่สำเร็จ");

            const newProjectId = projectData.project.id;

            // 2. ยิง API สร้างโฟลเดอร์ Google Drive 6 หมวดหมู่
            const driveRes = await fetch('/api/drive/setup-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerCode: formData.customerCode })
            });

            const driveData = await driveRes.json();
            if (!driveRes.ok) throw new Error(driveData.error || "สร้างโฟลเดอร์ Drive ไม่สำเร็จ");

            // 3. นำ ID ของ Google Drive กลับมาอัปเดตใส่ Project ใน Supabase
            const { error: updateError } = await supabase
                .from('projects')
                .update({ google_drive_folder_id: driveData.rootFolderId })
                .eq('id', newProjectId);

            if (updateError) throw new Error("อัปเดต Google Drive ID ไม่สำเร็จ");

            // สำเร็จทั้งหมด! ปิด Modal, รีเซ็ตฟอร์ม และรีเฟรชข้อมูลหน้าเว็บ
            onSuccess();
            onClose();
            setFormData({ customerCode: "", customerName: "", templateId: "", standardId: "V8R2" });

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
            setErrorMsg(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                    <h2 className="text-xl font-bold text-blue-400">✨ สร้างโปรเจกต์ใหม่</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition">✕</button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {errorMsg && (
                        <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {errorMsg}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">รหัสลูกค้า (Customer Code) *</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                            placeholder="เช่น WERW-2026-001"
                            value={formData.customerCode}
                            onChange={(e) => setFormData({ ...formData, customerCode: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">ชื่อลูกค้า (Customer Name) *</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                            placeholder="ระบุชื่อ-นามสกุล หรือชื่อบริษัท"
                            value={formData.customerName}
                            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Workflow Template</label>
                            <select
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition text-sm appearance-none"
                                value={formData.templateId}
                                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                            >
                                <option value="">-- ไม่เลือก --</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name || t.template_name || t.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">มาตรฐานหน้างาน</label>
                            <select
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition appearance-none"
                                value={formData.standardId}
                                onChange={(e) => setFormData({ ...formData, standardId: e.target.value })}
                            >
                                <option value="V8R2">V8R2</option>
                                <option value="V9">V9</option>
                            </select>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 mt-6 border-t border-gray-800 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`px-5 py-2.5 rounded-lg text-sm font-medium text-white transition flex items-center gap-2
                ${isLoading ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20'}
              `}
                        >
                            {isLoading ? 'กำลังสร้างระบบ...' : 'สร้างโปรเจกต์'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}