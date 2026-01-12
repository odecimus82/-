
import React, { useState, useEffect } from 'react';
import { LESSONS } from './constants';
import { Lesson, Question, SearchResult, UserProgress } from './types';
import { generateQuestionsFromContent, searchGuangzhouExamTrends, generateStudyMindmap } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'study' | 'practice' | 'trends' | 'profile' | 'wrong'>('study');
  const [user, setUser] = useState<UserProgress | null>(null);
  const [loginName, setLoginName] = useState('');
  
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reviewMode, setReviewMode] = useState<'summary' | 'mindmap'>('summary');
  const [mindmapContent, setMindmapContent] = useState<string>('');
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ text: string; links: SearchResult[] } | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [visibleHints, setVisibleHints] = useState<Record<string, boolean>>({});
  const [showDeployGuide, setShowDeployGuide] = useState(false);

  // Initialize & Persistence
  useEffect(() => {
    const savedUser = localStorage.getItem('history_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const saveUserProgress = (updated: UserProgress) => {
    setUser(updated);
    localStorage.setItem('history_user', JSON.stringify(updated));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;
    const newUser: UserProgress = {
      userId: Date.now().toString(),
      userName: loginName,
      completedLessons: [],
      quizScores: {},
      wrongQuestions: [],
      lastActive: new Date().toISOString()
    };
    saveUserProgress(newUser);
  };

  // Logic Actions
  const handleReview = async (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setReviewMode('summary');
    setApiError(null);
    
    const cachedMM = localStorage.getItem(`cache_mindmap_lesson_${lesson.id}`);
    if (cachedMM) {
      setMindmapContent(JSON.parse(cachedMM));
    } else {
      setLoading(true);
      try {
        const mm = await generateStudyMindmap(lesson.id, lesson.content);
        setMindmapContent(mm);
      } catch (err: any) {
        if (err?.message?.includes('429')) {
          setApiError('由于请求过于频繁，专家逻辑暂时无法加载。请稍等1分钟再试。');
        }
      } finally {
        setLoading(false);
      }
    }
    
    if (user && !user.completedLessons.includes(lesson.id)) {
      saveUserProgress({
        ...user,
        completedLessons: [...user.completedLessons, lesson.id]
      });
    }
  };

  const handleStartPractice = async (lesson: Lesson, forceNew: boolean = false) => {
    setSelectedLesson(lesson);
    setActiveTab('practice');
    setUserAnswers({});
    setScore(null);
    setVisibleHints({});
    setApiError(null);

    if (!forceNew) {
      const cachedQs = localStorage.getItem(`cache_questions_lesson_${lesson.id}`);
      if (cachedQs) {
        setQuestions(JSON.parse(cachedQs));
        return;
      }
    }

    setLoading(true);
    try {
      const qs = await generateQuestionsFromContent(lesson.id, lesson.content, forceNew);
      setQuestions(qs);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('429')) {
        setApiError('今日名师出题配额已达上限或频率过高，请休息片刻或查看已读单元。');
      } else {
        setApiError('出题过程中遇到了一点小麻烦，请重试。');
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateScore = () => {
    let choiceCorrect = 0;
    let choiceTotal = 0;
    const currentWrong: Question[] = [];

    questions.forEach(q => {
      if (q.type === 'choice') {
        choiceTotal++;
        if (userAnswers[q.id] === q.answer) {
          choiceCorrect++;
        } else {
          currentWrong.push(q);
        }
      } else {
        currentWrong.push(q);
      }
    });
    
    const finalScore = choiceTotal > 0 ? Math.round((choiceCorrect / choiceTotal) * 100) : 100;
    setScore(finalScore);

    if (user) {
      const currentBest = user.quizScores[selectedLesson!.id] || 0;
      saveUserProgress({
        ...user,
        quizScores: { ...user.quizScores, [selectedLesson!.id]: Math.max(currentBest, finalScore) },
        wrongQuestions: [...user.wrongQuestions, ...currentWrong.filter(q => !user.wrongQuestions.find(wq => wq.id === q.id))]
      });
    }
  };

  const toggleHint = (id: string) => {
    setVisibleHints(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const clearWrongQuestion = (id: string) => {
    if (!user) return;
    saveUserProgress({ ...user, wrongQuestions: user.wrongQuestions.filter(q => q.id !== id) });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment p-4 text-center">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full border-t-8 border-[#8b0000]">
          <h2 className="historical-title text-4xl mb-4 text-[#8b0000]">史学堂助手</h2>
          <p className="text-gray-400 mb-8 italic text-sm">南沙区高一历史复习专家系统</p>
          <input 
            type="text" 
            placeholder="请输入您的姓名" 
            className="w-full border-2 border-gray-100 p-4 rounded-xl mb-6 focus:border-[#8b0000] outline-none"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
          />
          <button className="w-full bg-[#8b0000] text-white py-4 rounded-xl text-lg font-bold shadow-lg active:scale-95 transition">
            开启复习之旅
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col parchment font-serif">
      <header className="bg-[#2c1810] text-[#fdf6e3] p-2 md:p-4 sticky top-0 z-40 shadow-xl border-b border-[#d4af37]">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
          <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
            <h1 className="historical-title text-2xl md:text-3xl text-[#d4af37]">历史复习通</h1>
            <div className="bg-white/10 px-2 py-0.5 rounded text-[10px] flex items-center">
              进度: {user.completedLessons.length}/{LESSONS.length}
            </div>
          </div>
          <nav className="flex items-center justify-center space-x-1 md:space-x-2">
            {['study', 'practice', 'wrong', 'trends'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-3 py-1.5 rounded text-xs md:text-sm transition ${activeTab === tab ? 'bg-[#d4af37] text-black font-bold' : 'hover:bg-white/10'}`}>
                {tab === 'study' ? '复习' : tab === 'practice' ? '练习' : tab === 'wrong' ? '错题' : '考情'}
              </button>
            ))}
            <button onClick={() => setActiveTab('profile')} className="ml-2 w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#d4af37] text-black flex items-center justify-center font-bold text-sm">
              {user.userName[0]}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-3 md:p-8">
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 md:p-8 rounded-2xl flex flex-col items-center border-4 border-[#d4af37] text-center max-w-[80%]">
              <div className="w-12 h-12 border-4 border-[#8b0000] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="historical-title text-xl text-[#8b0000]">专家正在深度研题...</p>
              <p className="text-gray-400 text-[10px] mt-2 italic">基于南沙区最新统考大纲实时匹配</p>
            </div>
          </div>
        )}

        {apiError && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 text-red-800 p-4 rounded-2xl flex items-center animate-fade-in">
            <svg className="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <div className="text-xs md:text-sm font-bold">{apiError}</div>
            <button onClick={() => setApiError(null)} className="ml-auto text-red-400 hover:text-red-600">关闭</button>
          </div>
        )}

        {/* STUDY TAB */}
        {activeTab === 'study' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 h-full">
            <div className="lg:col-span-4 space-y-3 h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] overflow-y-auto pr-1 scrollbar-thin">
              {LESSONS.map(lesson => (
                <div key={lesson.id} onClick={() => handleReview(lesson)} className={`cursor-pointer p-3 md:p-4 rounded-xl border-2 transition-all transform hover:-translate-y-1 ${selectedLesson?.id === lesson.id ? 'bg-white border-[#8b0000] shadow-xl' : 'bg-white/60 border-transparent shadow-sm'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold text-[#8b0000] bg-[#8b0000]/10 px-2 py-0.5 rounded">{lesson.period}</span>
                    {user.completedLessons.includes(lesson.id) && <span className="text-green-600 text-[9px] font-bold">✓ 已读</span>}
                  </div>
                  <h4 className="font-bold text-sm md:text-lg text-[#2c1810] leading-tight">{lesson.title}</h4>
                </div>
              ))}
            </div>

            <div className="lg:col-span-8 h-[calc(100vh-180px)] md:h-[calc(100vh-200px)]">
              {selectedLesson ? (
                <div className="bg-white rounded-2xl shadow-2xl border-b-8 border-[#d4af37] relative h-full flex flex-col animate-fade-in overflow-hidden">
                   <div className="p-4 md:p-8 flex-grow overflow-y-auto scrollbar-thin">
                      <div className="flex flex-col md:flex-row justify-between items-start mb-4 border-b border-gray-100 pb-3 gap-2">
                        <h2 className="text-xl md:text-3xl historical-title text-[#8b0000]">{selectedLesson.title}</h2>
                        <div className="flex space-x-2">
                           <button onClick={() => setReviewMode('summary')} className={`px-3 py-1 rounded-full text-[10px] font-bold border ${reviewMode === 'summary' ? 'bg-[#8b0000] text-white' : 'text-gray-500'}`}>大纲</button>
                           <button onClick={() => setReviewMode('mindmap')} className={`px-3 py-1 rounded-full text-[10px] font-bold border ${reviewMode === 'mindmap' ? 'bg-[#d4af37] text-black' : 'text-gray-500'}`}>逻辑链</button>
                        </div>
                      </div>
                      {reviewMode === 'summary' ? (
                        <div className="prose prose-stone animate-fade-in text-sm md:text-lg leading-relaxed whitespace-pre-wrap font-serif text-[#2c1810]">
                          {selectedLesson.content}
                        </div>
                      ) : (
                        <div className="bg-[#fcfcfc] p-4 rounded-xl border border-dashed border-[#d4af37]/40 whitespace-pre-wrap font-mono text-[11px] md:text-sm leading-loose">
                           {mindmapContent || "点击“单元真题演练”开始针对性学习..."}
                        </div>
                      )}
                   </div>
                   <div className="p-4 bg-[#fdfaf5] flex justify-center">
                      <button onClick={() => handleStartPractice(selectedLesson)} className="bg-[#8b0000] text-white px-8 py-3 rounded-full text-sm md:text-lg font-bold shadow-lg active:scale-95 transition">单元真题演练</button>
                   </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white/40 rounded-3xl border-2 border-dashed border-gray-300 p-6 text-center">
                  <p className="text-gray-500 font-bold mb-1">请在左侧选择复习单元</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRACTICE TAB */}
        {activeTab === 'practice' && (
          <div className="max-w-4xl mx-auto space-y-4 pb-40 animate-fade-in">
             {selectedLesson && questions.length > 0 ? (
               <>
                 <div className="bg-white p-4 rounded-xl shadow border-l-8 border-[#8b0000] flex justify-between items-center">
                    <div className="overflow-hidden">
                      <h2 className="text-base md:text-xl font-bold truncate">{selectedLesson.title}</h2>
                      <p className="text-[10px] text-gray-400">统考真题逻辑 · 11题演练</p>
                    </div>
                    {score !== null && <div className="text-2xl font-bold text-[#8b0000]">{score}%</div>}
                 </div>
                 <div className="space-y-4">
                   {questions.map((q, idx) => (
                     <div key={q.id} className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
                       <div className={`absolute top-0 left-0 w-1 h-full ${q.type === 'choice' ? 'bg-[#8b0000]/20' : 'bg-[#d4af37]'}`}></div>
                       <div className="flex items-start mb-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-2 mt-1 ${q.type === 'choice' ? 'bg-[#8b0000] text-white' : 'bg-[#d4af37] text-black'}`}>{q.type === 'choice' ? '单选' : '材料'}</span>
                          <div className="flex-grow">
                            {q.material && <div className="bg-[#f9f9f5] p-3 rounded-lg italic text-xs md:text-sm mb-3 border-l-4 border-[#d4af37] text-gray-700 leading-relaxed">{q.material}</div>}
                            <p className="text-sm md:text-lg font-bold text-[#2c1810]">{idx + 1}. {q.stem}</p>
                          </div>
                       </div>
                       {q.type === 'choice' ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:pl-8">
                           {q.options?.map((opt, i) => (
                             <button key={i} onClick={() => score === null && setUserAnswers(prev => ({ ...prev, [q.id]: String.fromCharCode(65 + i) }))} className={`text-left p-3 rounded-lg border text-xs md:text-sm transition ${userAnswers[q.id] === String.fromCharCode(65 + i) ? 'bg-[#fdf6e3] border-[#d4af37] font-bold' : 'bg-white border-gray-100'}`}>
                               <span className="mr-2 text-[#8b0000]">{String.fromCharCode(65 + i)}.</span>{opt}
                             </button>
                           ))}
                         </div>
                       ) : (
                         <div className="md:pl-8 space-y-3">
                            <button onClick={() => toggleHint(q.id)} className={`text-[10px] px-3 py-1.5 rounded-full border transition ${visibleHints[q.id] ? 'bg-[#d4af37] text-black' : 'border-[#d4af37] text-[#d4af37]'}`}>
                              {visibleHints[q.id] ? '正在背诵...' : '背诵提示'}
                            </button>
                            {visibleHints[q.id] && <div className="p-3 bg-[#fdf6e3] rounded-lg text-[10px] text-[#8b0000] italic">{q.hint}</div>}
                            <textarea disabled={score !== null} placeholder="在此列出答题要点..." className="w-full h-24 p-3 border border-gray-100 rounded-lg text-xs font-serif"></textarea>
                         </div>
                       )}
                       {score !== null && (
                         <div className="mt-4 p-4 rounded-lg bg-[#fdfaf5] border border-[#d4af37]/30 text-[10px] md:text-sm animate-slide-up">
                            <p className="font-bold text-[#8b0000] mb-1">答案：{q.answer}</p>
                            <p className="text-gray-700">{q.analysis}</p>
                         </div>
                       )}
                     </div>
                   ))}
                 </div>
                 {score === null && (
                    <div className="fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-gray-200 z-30">
                      <button onClick={() => handleStartPractice(selectedLesson!, true)} className="flex-1 bg-white text-[#8b0000] border border-[#8b0000] py-3 rounded-xl text-xs font-bold transition">换一批题</button>
                      <button onClick={calculateScore} className="flex-[2] bg-[#8b0000] text-white py-3 rounded-xl text-xs font-bold shadow-lg transition">提交评分</button>
                    </div>
                 )}
               </>
             ) : (
               <div className="text-center py-20 bg-white/60 rounded-3xl border-2 border-dashed border-gray-300 p-6">
                 <h3 className="text-xl font-bold text-gray-400 mb-4">请先选择复习单元</h3>
                 <button onClick={() => setActiveTab('study')} className="bg-[#8b0000] text-white px-8 py-2.5 rounded-full">前往复习</button>
               </div>
             )}
          </div>
        )}

        {/* OTHER TABS */}
        {activeTab === 'wrong' && (
          <div className="max-w-4xl mx-auto space-y-4 animate-fade-in pb-24">
             <div className="bg-white p-4 rounded-xl shadow border-l-8 border-[#d4af37] flex justify-between items-center">
                <h2 className="text-xl historical-title text-[#8b0000]">典藏 · 错题集</h2>
                <span className="text-2xl font-bold text-[#8b0000]">{user.wrongQuestions.length} 道</span>
             </div>
             {user.wrongQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white p-4 rounded-xl border border-gray-100 relative shadow-sm">
                  <button onClick={() => clearWrongQuestion(q.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-[10px]">移除</button>
                  <p className="text-sm font-bold mb-3">{idx + 1}. {q.stem}</p>
                  <div className="p-3 bg-[#fdf6e3] rounded-lg text-xs">
                    <p className="font-bold text-[#8b0000]">答案：{q.answer}</p>
                    <p className="mt-1 text-gray-600 italic">{q.analysis}</p>
                  </div>
                </div>
             ))}
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="max-w-4xl mx-auto animate-fade-in">
             <div className="bg-white p-6 rounded-3xl shadow-xl border-t-8 border-[#d4af37] relative">
                <h2 className="historical-title text-2xl text-[#8b0000] mb-4">广州南沙考情</h2>
                {!trends ? (
                  <div className="text-center py-12">
                    <button onClick={async () => {setLoading(true); setApiError(null); try{const data=await searchGuangzhouExamTrends();setTrends(data);}catch(err:any){if(err?.message?.includes('429'))setApiError('考情搜索过于频繁，请稍后再试。');}finally{setLoading(false);}}} className="bg-[#2c1810] text-[#d4af37] px-8 py-3 rounded-full text-sm font-bold">获取最新统考预测</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-4 bg-[#fdfaf2] rounded-2xl border-2 border-dashed border-[#d4af37]/20 text-xs md:text-base leading-relaxed font-serif">{trends.text}</div>
                    <div className="mt-4 space-y-2">
                       {trends.links.map((link, i) => (
                         <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline text-[10px] md:text-xs truncate">● {link.title}</a>
                       ))}
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}

        {activeTab === 'profile' && (
           <div className="max-w-2xl mx-auto bg-white p-8 rounded-3xl shadow-2xl border-b-8 border-[#8b0000] text-center animate-fade-in">
              <div className="w-20 h-20 bg-[#d4af37] rounded-full mx-auto flex items-center justify-center text-3xl font-bold mb-4">{user.userName[0]}</div>
              <h3 className="text-2xl font-bold mb-1">{user.userName}</h3>
              <p className="text-[#8b0000] text-[10px] mb-8 bg-[#8b0000]/5 px-3 py-1 rounded-full w-fit mx-auto">南沙统考备考官</p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[8px] text-gray-400 mb-1">已学</p>
                  <p className="text-xl font-bold text-[#8b0000]">{user.completedLessons.length}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[8px] text-gray-400 mb-1">均分</p>
                  <p className="text-xl font-bold text-[#8b0000]">{Object.values(user.quizScores).length ? Math.round((Object.values(user.quizScores) as number[]).reduce((a:number,b:number)=>a+b,0)/Object.values(user.quizScores).length) : 0}%</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[8px] text-gray-400 mb-1">错题</p>
                  <p className="text-xl font-bold text-[#8b0000]">{user.wrongQuestions.length}</p>
                </div>
              </div>
              
              <div className="mt-8 pt-8 border-t border-gray-100">
                <button 
                  onClick={() => setShowDeployGuide(!showDeployGuide)}
                  className="text-[#8b0000] text-sm font-bold flex items-center justify-center mx-auto mb-4"
                >
                  {showDeployGuide ? '收起部署指南' : '查看域名部署助手 (Vercel + Spaceship)'}
                  <svg className={`w-4 h-4 ml-1 transition-transform ${showDeployGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                
                {showDeployGuide && (
                  <div className="text-left bg-[#fdfaf5] p-4 rounded-xl border border-[#d4af37]/30 text-xs md:text-sm animate-slide-up">
                    <p className="font-bold text-[#8b0000] mb-2">Spaceship DNS 配置 (121719.xyz):</p>
                    <div className="space-y-2 font-mono bg-white p-3 rounded border border-gray-100 mb-4 overflow-x-auto">
                      <p><span className="text-gray-400">Type:</span> A | <span className="text-gray-400">Host:</span> @ | <span className="text-gray-400">Value:</span> 76.76.21.21</p>
                      <p><span className="text-gray-400">Type:</span> CNAME | <span className="text-gray-400">Host:</span> www | <span className="text-gray-400">Value:</span> cname.vercel-dns.com</p>
                    </div>
                    <p className="text-gray-500 italic text-[10px]">注：修改后可能需要 1-10 分钟生效。生效后在 Vercel Domains 填入 121719.xyz 即可访问。</p>
                  </div>
                )}
              </div>

              <button onClick={() => { localStorage.removeItem('history_user'); window.location.reload(); }} className="mt-12 text-gray-300 text-[10px]">清空数据并登出</button>
           </div>
        )}
      </main>

      <footer className="p-6 text-center text-[10px] text-gray-400 font-serif">
         南沙区高一历史复习通 · 历史名师专家系统
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #d4af37; border-radius: 10px; }
        @media (max-width: 640px) { .historical-title { font-size: 1.2rem !important; } }
      `}</style>
    </div>
  );
};

export default App;
