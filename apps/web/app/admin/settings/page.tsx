"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Tag, MapPin, Plus, Save, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@posterlink/ui";

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'categories' | 'regions'>('categories');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  
  const [newItemName, setNewItemName] = useState("");
  const [newItemCode, setNewItemCode] = useState("");

  const fetchData = async () => {
    setLoading(true);
    if (activeTab === 'categories') {
      const { data } = await supabase.from("categories").select("*").order("sort_order");
      if (data) setCategories(data);
    } else {
      const { data } = await supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false });
      if (data) setRegions(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleAddItem = async () => {
    if (!newItemName || !newItemCode) return;
    setSaving(true);
    
    const table = activeTab === 'categories' ? 'categories' : 'regions';
    const payload: any = { name: newItemName, code: newItemCode };
    
    if (activeTab === 'regions') payload.level = 'sido';
    else payload.sort_order = categories.length + 1;

    const { error } = await supabase.from(table).insert(payload);
    
    if (error) alert(error.message);
    else {
      setNewItemName("");
      setNewItemCode("");
      fetchData();
    }
    setSaving(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 관련 데이터가 있을 경우 삭제되지 않을 수 있습니다.")) return;
    
    const table = activeTab === 'categories' ? 'categories' : 'regions';
    const { error } = await supabase.from(table).delete().eq("id", id);
    
    if (error) alert("삭제할 수 없습니다. 이미 사용 중인 데이터인지 확인하세요.");
    else fetchData();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 italic">Master Data ⚙️</h1>
        <p className="text-gray-400 font-bold mt-2">서비스 전반에 사용되는 분류 체계와 지역 정보를 관리합니다.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => setActiveTab('categories')}
          className={`flex-1 p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${activeTab === 'categories' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600' : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'}`}
        >
          <Tag size={24} />
          <span className="font-black text-sm">카테고리 관리</span>
        </button>
        <button 
          onClick={() => setActiveTab('regions')}
          className={`flex-1 p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${activeTab === 'regions' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600' : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'}`}
        >
          <MapPin size={24} />
          <span className="font-black text-sm">지역 정보 관리</span>
        </button>
      </div>

      {/* Add Form */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 mb-8">
        <h3 className="text-sm font-black text-gray-400 uppercase mb-4 px-1">Add New {activeTab === 'categories' ? 'Category' : 'Region'}</h3>
        <div className="flex flex-col md:flex-row gap-3">
          <input 
            type="text" placeholder="이름 (예: 지원금/복지)" 
            value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 p-4 bg-gray-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-100 text-gray-900 placeholder:text-gray-400"
          />
          <input 
            type="text" placeholder="코드 (예: CAT_WELFARE)" 
            value={newItemCode} onChange={(e) => setNewItemCode(e.target.value)}
            className="flex-1 p-4 bg-gray-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-100 text-gray-900 placeholder:text-gray-400"
          />
          <button 
            onClick={handleAddItem}
            disabled={saving || !newItemName || !newItemCode}
            className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:bg-gray-200"
          >
            {saving ? <Loader2 className="animate-spin" /> : "추가"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-[1.5rem] animate-pulse" />)
        ) : (activeTab === 'categories' ? categories : regions).map((item) => (
          <div key={item.id} className="bg-white p-5 rounded-2xl border border-gray-50 flex items-center justify-between group hover:shadow-sm transition-all">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center font-black text-[10px]">
                {item.code.split('_').pop()?.slice(0, 3)}
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">{item.name}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-tighter">{item.code}</p>
              </div>
            </div>
            <button 
              onClick={() => handleDeleteItem(item.id)}
              className="p-3 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
