"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import CreateProjectModal from "../components/CreateProjectModal";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects'>('dashboard');
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [uploadingMilestoneId, setUploadingMilestoneId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setProjects(data);
    if (error) console.error("Error fetching projects:", error);
    setLoading(false);
  }

  async function handleSelectProject(project: any) {
    setSelectedProject(project);
    setActiveTab('projects');
    setMilestones([]);
    setLoadingMilestones(true);

    const { data } = await supabase
      .from('project_milestones')
      .select(`id, actual_completed_at, sla_status, evidence_files, workflow_definitions (step_name, order_index, sla_hours)`)
      .eq('project_id', project.id);

    if (data) {
      const sorted = (data as any[]).sort((a: any, b: any) => a.workflow_definitions?.order_index - b.workflow_definitions?.order_index);
      
      let previousCompleteTime: Date | null = new Date(project.created_at);
      
      const milestonesWithSLA = sorted.map((m: any) => {
        const slaHours = m.workflow_definitions?.sla_hours || 0;
        let dynamicStatus = 'Waiting';
        let deadline: Date | null = null;

        if (m.actual_completed_at) {
          dynamicStatus = 'Completed';
          previousCompleteTime = new Date(m.actual_completed_at);
        } else {
          if (previousCompleteTime) {
            deadline = new Date(previousCompleteTime.getTime() + slaHours * 60 * 60 * 1000);
            if (new Date() > deadline) {
              dynamicStatus = 'Overdue';
            } else {
              dynamicStatus = 'In Progress';
            }
            previousCompleteTime = null;
          }
        }
        
        return { ...m, dynamicStatus, deadline };
      });

      setMilestones(milestonesWithSLA);
    }
    setLoadingMilestones(false);
  }

  async function handleCompleteMilestone(milestoneId: string) {
    if (!window.confirm("Confirm completion of this step?")) return;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('project_milestones')
      .update({ actual_completed_at: now, sla_status: 'On-track' })
      .eq('id', milestoneId);

    if (error) {
      alert("Error updating status: " + error.message);
      return;
    }

    const currentIndex = milestones.findIndex(m => m.id === milestoneId);
    let nextStatus = "Completed All Steps";
    if (currentIndex >= 0 && currentIndex < milestones.length - 1) {
       nextStatus = milestones[currentIndex + 1].workflow_definitions?.step_name || "In Progress";
    }
    
    await supabase.from('projects').update({ status: nextStatus }).eq('id', selectedProject.id);

    fetchProjects();
    if (selectedProject) {
      handleSelectProject({ ...selectedProject, status: nextStatus });
    }
  }

  async function handleFileUpload(milestone: any, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedProject?.google_drive_folder_id) {
      alert('Project folder not found in Drive.');
      return;
    }

    setUploadingMilestoneId(milestone.id);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderId', selectedProject.google_drive_folder_id);
      formData.append('milestoneName', milestone.workflow_definitions?.step_name || 'Evidence');

      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const existingFiles = milestone.evidence_files || [];
      const newFiles = [...existingFiles, { fileId: data.fileId, name: file.name }];

      await supabase
        .from('project_milestones')
        .update({ evidence_files: newFiles })
        .eq('id', milestone.id);

      if (selectedProject) {
        handleSelectProject(selectedProject);
      }

      alert(`File uploaded successfully!`);
      
    } catch (error: any) {
      alert("Upload failed: " + error.message);
    } finally {
      setUploadingMilestoneId(null);
      e.target.value = '';
    }
  }

  const revenueData = [
    { name: 'Jan', value: 12 },
    { name: 'Feb', value: 19 },
    { name: 'Mar', value: 15 },
    { name: 'Apr', value: 25 },
    { name: 'May', value: 32 },
    { name: 'Jun', value: projects.length || 45 },
  ];

  const statusData = [
    { name: 'Completed', value: projects.filter(p => p.status === 'Completed All Steps').length || 1, color: '#10b981' },
    { name: 'In Progress', value: projects.filter(p => p.status !== 'Completed All Steps').length || 5, color: '#e2e8f0' },
    { name: 'Overdue', value: 2, color: '#f43f5e' },
  ];

  const completedMilestones = milestones.filter(m => m.actual_completed_at).length;
  const totalMilestones = milestones.length;
  const progressPercent = Math.round((completedMilestones / totalMilestones) * 100) || 0;
  const currentMilestone = milestones.find(m => m.dynamicStatus === 'In Progress' || m.dynamicStatus === 'Overdue');
  const overdueMilestones = milestones.filter(m => m.dynamicStatus === 'Overdue').length;

  return (
    <div className="flex h-screen bg-[#FBFBFC] text-[#171717] font-sans overflow-hidden selection:bg-emerald-200">
      
      {/* Sidebar */}
      <aside
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
        className="relative z-20 flex h-screen w-12 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-600"
      >
        <div className="flex h-[90px] items-start justify-center border-b border-slate-200 pt-6">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center text-emerald-500">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" /></svg>
          </div>
        </div>

        <nav className={`flex-1 space-y-1 px-2 py-5 transition-opacity ${isSidebarCollapsed ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={() => { setActiveTab('dashboard'); setSelectedProject(null); }}
            title="Dashboard"
            className={`flex h-9 w-full items-center justify-center rounded-md text-[13px] transition-colors ${activeTab === 'dashboard' ? 'bg-slate-100 font-semibold text-slate-950' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 5h5.5v5.5H4.5V5Zm9.5 0h5.5v5.5H14V5ZM4.5 14h5.5v5H4.5v-5Zm9.5 0h5.5v5H14v-5Z" /></svg>
          </button>

          <button
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
            title="Projects"
            className={`flex h-9 w-full items-center justify-center rounded-md text-[13px] transition-colors ${activeTab === 'projects' ? 'bg-slate-100 font-semibold text-slate-950' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h5.2l1.6 2H20v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" /></svg>
          </button>

          <button
            title="Team"
            className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
          >
            <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 18.5c0-2-1.8-3.5-4-3.5s-4 1.5-4 3.5M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 4.5c1.5.4 2.5 1.5 2.5 3M17 12a2.5 2.5 0 0 0 0-5M6 16.5c-1.5.4-2.5 1.5-2.5 3M7 12a2.5 2.5 0 0 1 0-5" /></svg>
          </button>

          <button
            title="Billing"
            className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
          >
            <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 4.5h12v15H6v-15Zm3 5h6m-6 3h6m-6 3h3M12 7v11" /></svg>
          </button>

          <button
            title="Settings"
            className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
          >
            <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6.5-1.4 1.4M6.9 17.1l-1.4 1.4m0-13 1.4 1.4m10.2 10.2 1.4 1.4" /></svg>
          </button>
        </nav>

        <div className={`border-t border-slate-200 p-2 transition-opacity ${isSidebarCollapsed ? 'opacity-100' : 'opacity-0'}`}>
          <div title="Hover to expand sidebar" className="flex h-9 w-full cursor-default items-center justify-center rounded-md text-slate-500">
            <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.5 5.5h11v13h-11v-13Zm3 0v13" /></svg>
          </div>
        </div>

        {!isSidebarCollapsed && (
          <div className="absolute left-0 top-[90px] bottom-0 w-52 border-r border-slate-200 bg-white shadow-[8px_0_18px_rgba(15,23,42,0.04)]">
            <nav className="space-y-1 px-2 py-6">
              <button
                onClick={() => { setActiveTab('dashboard'); setSelectedProject(null); }}
                className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${activeTab === 'dashboard' ? 'bg-slate-100 font-semibold text-slate-950' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
              >
                <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 5h5.5v5.5H4.5V5Zm9.5 0h5.5v5.5H14V5ZM4.5 14h5.5v5H4.5v-5Zm9.5 0h5.5v5H14v-5Z" /></svg>
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
                className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${activeTab === 'projects' ? 'bg-slate-100 font-semibold text-slate-950' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
              >
                <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h5.2l1.6 2H20v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" /></svg>
                <span>Projects</span>
              </button>

              <button className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950">
                <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 18.5c0-2-1.8-3.5-4-3.5s-4 1.5-4 3.5M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 4.5c1.5.4 2.5 1.5 2.5 3M17 12a2.5 2.5 0 0 0 0-5M6 16.5c-1.5.4-2.5 1.5-2.5 3M7 12a2.5 2.5 0 0 1 0-5" /></svg>
                <span>Team</span>
              </button>

              <button className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950">
                <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 4.5h12v15H6v-15Zm3 5h6m-6 3h6m-6 3h3M12 7v11" /></svg>
                <span>Billing</span>
              </button>

              <button className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950">
                <svg className="h-[17px] w-[17px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6.5-1.4 1.4M6.9 17.1l-1.4 1.4m0-13 1.4 1.4m10.2 10.2 1.4 1.4" /></svg>
                <span>Organization Settings</span>
              </button>
            </nav>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#FBFBFC] relative">
        <div className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-6 border-b border-slate-200 bg-white px-8 ${selectedProject ? 'h-[112px]' : 'h-[90px]'}`}>
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-500">
              <span>SunBase</span>
              <span className="text-slate-300">/</span>
              {activeTab === 'dashboard' ? (
                <span className="font-semibold text-slate-950">Dashboard</span>
              ) : selectedProject ? (
                <>
                  <button onClick={() => { setActiveTab('projects'); setSelectedProject(null); }} className="hover:text-slate-900 transition-colors">Projects</button>
                  <span className="text-slate-300">/</span>
                  <span className="font-semibold text-slate-950">{selectedProject.customer_code}</span>
                </>
              ) : (
                <span className="font-semibold text-slate-950">Projects</span>
              )}
            </div>
            <h2 className="text-[20px] font-semibold leading-none tracking-tight text-slate-950">
              {activeTab === 'dashboard' ? 'Overview' : selectedProject ? selectedProject.customer_name : 'Projects'}
            </h2>
            {selectedProject && (
              <p className="mt-3 text-[12px] text-slate-500">
                Current stage: <b className="font-semibold text-slate-800">{currentMilestone?.workflow_definitions?.step_name || selectedProject.status || 'Completed All Steps'}</b>
              </p>
            )}
          </div>
          
          <div className="flex shrink-0 items-center gap-3">
            {activeTab === 'projects' && selectedProject && (
              <div className="mr-3 hidden overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 lg:grid lg:grid-cols-3">
                <div className="min-w-[118px] border-r border-slate-200 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Progress</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{progressPercent}%</p>
                </div>
                <div className="min-w-[118px] border-r border-slate-200 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Stages</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{completedMilestones}<span className="text-sm font-semibold text-slate-400">/{totalMilestones}</span></p>
                </div>
                <div className="min-w-[118px] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">SLA</p>
                  <p className={`mt-1 text-xl font-bold ${overdueMilestones > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{overdueMilestones > 0 ? 'Risk' : 'Good'}</p>
                </div>
              </div>
            )}
            <button onClick={() => fetchProjects()} className="p-2 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-md text-sm transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
            {activeTab === 'projects' && !selectedProject && (
              <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md text-[13px] font-medium transition-colors">New Project</button>
            )}
            {activeTab === 'projects' && selectedProject && (
              <button onClick={() => setSelectedProject(null)} className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[13px] font-medium transition-colors">Back to Projects</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
          
          {activeTab === 'dashboard' ? (
            <div className="max-w-[1200px] mx-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">Total Projects YTD</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">+12% from last month</p>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">Active Implementation</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{projects.filter(p => p.status !== 'Completed All Steps').length}</p>
                  <p className="text-[11px] text-slate-500 mt-1">65% capacity utilization</p>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">SLA Compliance</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">98.2%</p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">On Track</p>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-slate-500">Flagged / Overdue</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">2</p>
                  <p className="text-[11px] text-rose-500 font-medium mt-1">Requires Attention</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-900 mb-6">Installation Volume</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                        <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                        <Bar dataKey="value" fill="#171717" radius={[4, 4, 0, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-900 mb-6">Portfolio Status</h3>
                  <div className="h-[200px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                          {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-4">
                    {statusData.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[12px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="font-medium text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : !selectedProject ? (
            <div className="mx-auto max-w-[1200px] space-y-6 pt-1">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#f9fafb] text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-4 py-3.5">Project Name</th>
                      <th className="px-4 py-3.5">Code</th>
                      <th className="px-4 py-3.5">Current Stage</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {loading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading...</td></tr>
                    ) : (
                      projects.map((project) => (
                        <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3.5 font-semibold text-slate-950">{project.customer_name}</td>
                          <td className="px-4 py-3.5 font-mono text-[11px] font-medium text-slate-500">{project.customer_code}</td>
                          <td className="px-4 py-3.5 text-slate-700">{project.status || 'Initial'}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-medium ${project.status === 'Completed All Steps' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {project.status === 'Completed All Steps' ? 'Completed' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button onClick={() => handleSelectProject(project)} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-950 transition-colors hover:bg-slate-50">View</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[1520px] space-y-5">
              <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-[17px] font-bold text-slate-950">Implementation Plan</h3>
                      <p className="text-[12px] text-slate-500">Track milestones, evidence, and SLA timing</p>
                    </div>
                    <button 
                      onClick={() => window.open(`https://drive.google.com/drive/folders/${selectedProject.google_drive_folder_id}`, '_blank')}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                      Drive Folder
                    </button>
                  </div>
                  
                  {loadingMilestones ? (
                    <div className="p-12 text-center bg-white rounded-xl border border-slate-200">Loading...</div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                        <div>
                          <p className="text-[13px] font-bold text-slate-900">Stage Timeline</p>
                          <p className="text-[11px] text-slate-500">{totalMilestones} stages in this workflow</p>
                        </div>
                        <div className="hidden items-center gap-4 text-[11px] text-slate-500 sm:flex">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>Done</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-emerald-500 bg-white"></span>Active</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-200"></span>Waiting</span>
                        </div>
                      </div>
                      <div className="px-5 py-6">
                        <div
                          className="relative grid w-full gap-3 pt-8"
                          style={{ gridTemplateColumns: `repeat(${Math.max(milestones.length, 1)}, minmax(0, 1fr))` }}
                        >
                        {milestones.map((m: any, index: number) => {
                          const isCompleted = m.dynamicStatus === 'Completed';
                          const isCurrent = m.dynamicStatus === 'In Progress' || m.dynamicStatus === 'Overdue';
                          const isOverdue = m.dynamicStatus === 'Overdue';
                          return (
                            <div key={m.id} className="relative flex min-w-0 flex-col items-center group">
                              <div className={`absolute left-0 top-[14px] h-[3px] w-1/2 ${index === 0 ? 'bg-transparent' : isCompleted || isCurrent ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
                              <div className={`absolute right-0 top-[14px] h-[3px] w-1/2 ${isCompleted ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
                              <div className="relative z-10 flex h-8 w-full justify-center shrink-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all
                                  ${isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 
                                    isCurrent ? 'bg-white border-2 border-emerald-500 text-emerald-600 shadow-lg ring-4 ring-emerald-50' : 
                                    'bg-slate-50 border border-slate-200 text-slate-400'}
                                `}>
                                  {isCompleted ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : index + 1}
                                </div>
                              </div>
                              <div className={`mt-4 flex min-h-[168px] w-full min-w-0 flex-col rounded-lg border p-3 transition-all
                                ${isCurrent ? 'border-emerald-200 bg-emerald-50/40 shadow-md shadow-emerald-100/70' : isCompleted ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/50 opacity-75'}
                              `}>
                                <div className="flex flex-1 flex-col gap-3">
                                  <div>
                                    <p className="mb-1.5 font-mono text-[9px] font-semibold text-slate-400">STAGE {index + 1}</p>
                                    <div className="flex min-h-11 flex-col items-start gap-1.5">
                                      <h4 className="line-clamp-2 text-[12px] font-bold leading-4 text-slate-950">{m.workflow_definitions?.step_name}</h4>
                                      {isOverdue && <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">OVERDUE</span>}
                                      {isCurrent && !isOverdue && <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ACTIVE</span>}
                                    </div>
                                    <div className="mt-3 grid gap-1.5 text-[11px] text-slate-500">
                                      <div className="flex items-center justify-between gap-2"><span>SLA</span><b className="truncate font-semibold text-slate-800">{m.workflow_definitions?.sla_hours}h</b></div>
                                      <div className="flex items-center justify-between gap-2"><span>{isCompleted ? 'Done' : 'Due'}</span><b className={`truncate ${isOverdue ? 'font-semibold text-rose-600' : 'font-semibold text-slate-800'}`}>
                                        {m.actual_completed_at ? new Date(m.actual_completed_at).toLocaleDateString() : m.deadline ? new Date(m.deadline).toLocaleDateString() : 'N/A'}
                                      </b></div>
                                      <div className="flex items-center justify-between gap-2"><span>Owner</span><b className="truncate font-semibold text-slate-800">Admin</b></div>
                                    </div>
                                  </div>
                                  {m.evidence_files?.length > 0 && (
                                    <div className="mt-auto flex -space-x-2 self-start">
                                      {m.evidence_files.map((file: any, idx: number) => (
                                        <button key={idx} onClick={() => setPreviewImage(`/api/drive/image?fileId=${file.fileId}`)} className="h-6 w-6 overflow-hidden rounded border-2 border-white shadow-sm transition-transform hover:scale-110">
                                          <img src={`/api/drive/image?fileId=${file.fileId}`} alt="" className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/150'} />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {isCurrent && (
                                  <div className="mt-3 grid gap-1.5 border-t border-emerald-100 pt-3">
                                    <label className="cursor-pointer rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-center text-[10px] font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-50">
                                      {uploadingMilestoneId === m.id ? 'Uploading...' : 'Upload Evidence'}
                                      <input type="file" className="hidden" onChange={(e) => handleFileUpload(m, e)} disabled={uploadingMilestoneId === m.id} />
                                    </label>
                                    <button onClick={() => handleCompleteMilestone(m.id)} className="rounded-md bg-slate-950 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm transition-all hover:bg-slate-800">Complete Step</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            </div>
          )}
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-6 right-6 text-white/50 hover:text-white bg-white/10 p-3 rounded-full transition-all" onClick={() => setPreviewImage(null)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="max-w-5xl w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      <CreateProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => fetchProjects()} />
    </div>
  );
}
