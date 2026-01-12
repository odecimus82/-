
import React, { useState, useEffect, useRef } from 'react';
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
  const [trends, setTrends] = useState<{ text: string; links: SearchResult[] } | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [visibleHints, setVisibleHints] = useState<Record<string, boolean>>({});

  // Pre-fetching ref to avoid multiple calls
  const prefetchQueue = useRef<Set<number>>(new Set());

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

  // Background Prefetch
  const prefetchLessonData = async (lesson: Lesson) => {
    if (prefetchQueue.current.has(lesson.id)) return;
    prefetchQueue.current.add(lesson.id);
    generateQuestionsFromContent(lesson.id, lesson.content).catch(() => {});
    generateStudyMindmap(lesson.id, lesson.content).catch(() => {});
  };

  // Logic Actions
  const handleReview = async (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setReviewMode('summary');
    
    const cachedMM = localStorage.getItem(`cache_mindmap_lesson_${lesson.id}`);
    if (cachedMM) {
      setMindmapContent(JSON.parse(cachedMM));
    } else {
      setLoading(true);
      try {
        const mm = await generateStudyMindmap(lesson.id, lesson.content);
        setMindmapContent(mm);
      } catch (err) {
        console.error("Failed to fetch mindmap", err);
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
    } catch (err) {
      console.error("Failed to generate practice questions", err);
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
        // Material questions are for review, only added to history if unanswered or user wants
        currentWrong.push(q);
      }
    });
    
    const finalScore = choiceTotal > 0 ? Math.round((choiceCorrect / choiceTotal) * 100) : 100;
    setScore(finalScore);

    if (user) {
      const currentBest = user.quizScores[selectedLesson!.id] || 0;
      const existingWrongIds = new Set(user.wrongQuestions.map(wq => wq.id));
      const newlyAddedWrongs = currentWrong.filter(q => !existingWrongIds.has(q.id));

      saveUserProgress({
        ...user,
        quizScores: {
          ...user.quizScores,
          [selectedLesson!.id]: Math.max(currentBest, finalScore)
        },
        wrongQuestions: [...user.wrongQuestions, ...newlyAddedWrongs]
      });
    }
  };

  const toggleHint = (id: string) => {
    setVisibleHints(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const clearWrongQuestion = (id: string) => {
    if (!user) return;
    saveUserProgress({
      ...user,
      wrongQuestions: user.wrongQuestions.filter(q => q.id !== id)
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full border-t-8 border-[#8b0000]">
          <h2 className="historical-title text-4xl text-center mb-6 text-[#8b0000]">史学堂助手</h2>
          <p className="text-gray-600 mb-8 text-center italic">“读史可以明智，知古方能鉴今。”</p>
          <input 
            type="text" 
            placeholder="请输入您的学号或姓名" 
            className="w-full border-2 border-gray-200 p-4 rounded-xl mb-6 focus:border-[#8b0000] outline-none transition"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
          />
          <button className="w-full bg-[#8b0000] text-white py-4 rounded-xl text-xl font-bold hover:bg-[#a00000] shadow-lg">
            开启考前突击
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col parchment font-serif">
      <header className="bg-[#2c1810] text-[#fdf6e3] p-4 sticky top-0 z-40 shadow-xl border-b border-[#d4af37]">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="historical-title text-2xl md:text-3xl text-[#d4af37]">历史复习通</h1>
            <div className="hidden md:flex bg-white/10 px-3 py-1 rounded text-xs items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              进度: {user.completedLessons.length}/{LESSONS.length} 单元
            </div>
          </div>
          <nav className="flex space-x-2 md:space-x-4">
            {['study', 'practice', 'wrong', 'trends'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-3 py-1 rounded transition text-sm md:text-base ${activeTab === tab ? 'bg-[#d4af37] text-black font-bold' : 'hover:bg-white/10'}`}
              >
                {tab === 'study' ? '复习' : tab === 'practice' ? '练习' : tab === 'wrong' ? '错题' : '考情'}
              </button>
            ))}
            <button onClick={() => setActiveTab('profile')} className="w-8 h-8 rounded-full bg-[#d4af37] text-black flex items-center justify-center font-bold">
              {user.userName[0]}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 md:p-8">
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl flex flex-col items-center border-4 border-[#d4af37]">
              <div className="w-16 h-16 border-4 border-[#8b0000] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="historical-title text-2xl text-[#8b0000]">极速出题中...</p>
              <p className="text-gray-400 text-sm mt-2 italic">正在为您匹配广州南沙最新真题逻辑</p>
            </div>
          </div>
        )}

        {/* STUDY TAB */}
        {activeTab === 'study' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            <div className="lg:col-span-4 space-y-4 h-[calc(100vh-200px)] overflow-y-auto pr-2 scrollbar-thin">
              {LESSONS.map(lesson => (
                <div 
                  key={lesson.id}
                  onMouseEnter={() => prefetchLessonData(lesson)}
                  onClick={() => handleReview(lesson)}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 transform hover:-translate-y-1 ${
                    selectedLesson?.id === lesson.id 
                      ? 'bg-white border-[#8b0000] shadow-xl' 
                      : 'bg-white/60 border-transparent hover:border-gray-300 shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-[#8b0000] uppercase tracking-tighter bg-[#8b0000]/10 px-2 py-0.5 rounded">
                      {lesson.period}
                    </span>
                    {user.completedLessons.includes(lesson.id) && (
                      <span className="text-green-600 text-xs font-bold">已读</span>
                    )}
                  </div>
                  <h4 className="font-bold text-lg text-[#2c1810] leading-tight">{lesson.title}</h4>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lesson.keyConcepts.map(k => (
                      <span key={k} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded">#{k}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-8 h-[calc(100vh-200px)]">
              {selectedLesson ? (
                <div className="bg-white rounded-2xl shadow-2xl border-b-8 border-[#d4af37] relative h-full flex flex-col animate-fade-in">
                   <div className="p-6 md:p-8 flex-grow overflow-y-auto scrollbar-thin">
                      <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                        <h2 className="text-3xl historical-title text-[#8b0000]">
                          {selectedLesson.title}
                        </h2>
                        <div className="flex space-x-2">
                           <button 
                             onClick={() => setReviewMode('summary')}
                             className={`px-4 py-1 rounded-full text-xs font-bold border transition ${reviewMode === 'summary' ? 'bg-[#8b0000] text-white shadow-md' : 'text-gray-500 border-gray-200'}`}
                           >
                             纲要
                           </button>
                           <button 
                             onClick={() => setReviewMode('mindmap')}
                             className={`px-4 py-1 rounded-full text-xs font-bold border transition ${reviewMode === 'mindmap' ? 'bg-[#d4af37] text-black shadow-md' : 'text-gray-500 border-gray-200'}`}
                           >
                             逻辑
                           </button>
                        </div>
                      </div>

                      {reviewMode === 'summary' ? (
                        <div className="prose prose-stone max-w-none animate-fade-in">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                            {selectedLesson.keyConcepts.map(c => (
                              <div key={c} className="flex items-center p-2 bg-[#fdf6e3] rounded-lg border border-[#d4af37]/20">
                                <div className="w-1.5 h-1.5 bg-[#8b0000] rotate-45 mr-2"></div>
                                <span className="font-bold text-xs">{c}</span>
                              </div>
                            ))}
                          </div>
                          <div className="leading-relaxed text-lg whitespace-pre-wrap font-serif text-[#2c1810]">
                            {selectedLesson.content}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-[#fcfcfc] p-6 rounded-xl border border-dashed border-[#d4af37]/40 whitespace-pre-wrap font-mono text-sm leading-loose animate-fade-in h-fit">
                           {mindmapContent || "正在由名师为您提炼核心逻辑链条..."}
                        </div>
                      )}
                   </div>

                   <div className="p-6 border-t border-gray-50 bg-[#fdfaf5] rounded-b-2xl flex justify-center">
                      <button 
                        onClick={() => handleStartPractice(selectedLesson)}
                        className="flex items-center space-x-2 bg-[#8b0000] text-white px-10 py-3 rounded-full text-lg font-bold hover:scale-105 transition shadow-2xl active:scale-95"
                      >
                        <span>针对此单元 · 开启真题演练</span>
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                      </button>
                   </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white/40 rounded-3xl border-2 border-dashed border-gray-300 p-10">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-inner mb-6">
                    <svg className="w-10 h-10 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.994 7.994 0 002 12a8 8 0 008 8 8.001 8.001 0 007.464-5.118l-1.464-.316A6.501 6.501 0 0110 18.5a6.5 6.5 0 01-6.5-6.5 6.5 6.5 0 014.116-6.048l.384 1.548z" /></svg>
                  </div>
                  <p className="text-xl text-gray-500 font-bold mb-2">温故而知新</p>
                  <p className="text-gray-400 text-sm text-center">点击左侧单元列表，AI将基于详细考纲为您提炼重点</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRACTICE TAB */}
        {activeTab === 'practice' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
             {selectedLesson && questions.length > 0 ? (
               <>
                 <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow border-l-8 border-[#8b0000]">
                    <div>
                      <h2 className="text-xl font-bold">{selectedLesson.title}</h2>
                      <p className="text-xs text-gray-400">考点训练 · 包含{questions.filter(q => q.type === 'choice').length}道选择 & 1道史料</p>
                    </div>
                    <div className="flex items-center space-x-6">
                      {score === null && (
                        <button 
                          onClick={() => handleStartPractice(selectedLesson, true)}
                          className="flex items-center text-xs text-[#8b0000] hover:underline bg-[#8b0000]/10 px-3 py-1.5 rounded-full"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                          极速换题
                        </button>
                      )}
                      {score !== null && (
                        <div className="text-right">
                          <span className="text-3xl font-bold text-[#8b0000]">{score}</span>
                          <span className="text-gray-400">/100</span>
                        </div>
                      )}
                    </div>
                 </div>

                 <div className="space-y-6 pb-32">
                   {questions.map((q, idx) => (
                     <div key={q.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden transition hover:shadow-md">
                       <div className={`absolute top-0 left-0 w-1.5 h-full ${q.type === 'choice' ? 'bg-[#8b0000]/20' : 'bg-[#d4af37]'}`}></div>
                       
                       <div className="flex items-start mb-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold mr-3 mt-1 shadow-sm ${q.type === 'choice' ? 'bg-[#8b0000] text-white' : 'bg-[#d4af37] text-black'}`}>
                            {q.type === 'choice' ? '单选' : '史料分析'}
                          </span>
                          <div className="flex-grow">
                            {q.material && (
                              <div className="bg-[#f9f9f5] p-5 rounded-lg italic text-base mb-4 border-l-4 border-[#d4af37] text-gray-700 leading-relaxed shadow-inner font-serif">
                                {q.material}
                              </div>
                            )}
                            <p className="text-lg font-bold text-[#2c1810] leading-snug">{idx + 1}. {q.stem}</p>
                          </div>
                       </div>

                       {q.type === 'choice' ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-10">
                           {q.options?.map((opt, i) => (
                             <button
                               key={i}
                               onClick={() => score === null && setUserAnswers(prev => ({ ...prev, [q.id]: String.fromCharCode(65 + i) }))}
                               className={`text-left p-3 rounded-lg border-2 transition-all ${
                                 userAnswers[q.id] === String.fromCharCode(65 + i)
                                   ? 'bg-[#fdf6e3] border-[#d4af37] shadow-inner font-bold'
                                   : 'bg-white border-gray-100 hover:bg-gray-50'
                               } ${score !== null ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                             >
                               <span className="mr-2 text-[#8b0000] font-mono">{String.fromCharCode(65 + i)}.</span>
                               <span className="text-sm">{opt}</span>
                             </button>
                           ))}
                         </div>
                       ) : (
                         <div className="pl-10 space-y-4">
                            {q.hint && (
                              <div className="flex flex-col space-y-2">
                                <button 
                                  onClick={() => toggleHint(q.id)}
                                  className={`w-fit flex items-center text-xs px-4 py-2 rounded-full border-2 transition-all ${visibleHints[q.id] ? 'bg-[#d4af37] border-[#d4af37] text-black font-bold' : 'border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10'}`}
                                >
                                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                                  {visibleHints[q.id] ? '正在背诵...' : '开启背诵提示'}
                                </button>
                                {visibleHints[q.id] && (
                                  <div className="p-4 bg-[#fdf6e3] border border-[#d4af37]/40 rounded-xl text-sm text-[#8b0000] animate-fade-in shadow-sm">
                                    <p className="font-bold mb-1 flex items-center">
                                      <span className="w-1 h-3 bg-[#8b0000] mr-2"></span>
                                      记忆关键词/逻辑要点：
                                    </p>
                                    <div className="leading-relaxed italic">{q.hint}</div>
                                  </div>
                                )}
                              </div>
                            )}
                            <textarea 
                              disabled={score !== null}
                              placeholder="【考场模拟】请在此简要列出答题要点（可参考上方背诵提示）..."
                              className="w-full h-32 p-4 border-2 border-gray-100 rounded-xl outline-none focus:border-[#d4af37] transition bg-[#fcfcfc] text-sm font-serif"
                            ></textarea>
                         </div>
                       )}

                       {score !== null && (
                         <div className="mt-6 p-5 rounded-xl bg-[#fdfaf5] border border-[#d4af37]/30 animate-slide-up shadow-sm">
                            <div className="flex items-center mb-2">
                              <span className="font-bold text-[#8b0000] mr-2">【标准答案】</span>
                              <span className="bg-white px-3 py-1 rounded shadow-sm font-mono font-bold text-[#8b0000] border border-[#8b0000]/10">{q.answer}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed font-serif"><span className="font-bold text-gray-500">解析引导：</span>{q.analysis}</p>
                         </div>
                       )}
                     </div>
                   ))}

                   {score === null && (
                     <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md p-5 border-t border-gray-100 z-30 shadow-2xl flex justify-center space-x-6">
                       <button 
                          onClick={() => handleStartPractice(selectedLesson!, true)}
                          className="bg-white text-[#8b0000] border-2 border-[#8b0000] px-10 py-4 rounded-full text-lg font-bold shadow-xl hover:bg-[#8b0000]/5 transition active:scale-95 flex items-center"
                       >
                         <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                         随机换题
                       </button>
                       <button 
                          onClick={calculateScore}
                          className="bg-[#8b0000] text-white px-20 py-4 rounded-full text-xl font-bold shadow-2xl hover:bg-[#a00000] transition active:scale-95 flex items-center"
                       >
                         <span>提交评分</span>
                         <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                       </button>
                     </div>
                   )}
                 </div>
               </>
             ) : (
               <div className="text-center py-24 bg-white/60 rounded-3xl border-2 border-dashed border-gray-300">
                 <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <svg className="w-10 h-10 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" /></svg>
                 </div>
                 <h3 className="text-2xl font-bold text-gray-400 mb-4">请先选择复习单元以生成题目</h3>
                 <button onClick={() => setActiveTab('study')} className="bg-[#8b0000] text-white px-10 py-3 rounded-full shadow-lg hover:bg-[#a00000] transition">前往复习</button>
               </div>
             )}
          </div>
        )}

        {/* WRONG QUESTIONS TAB */}
        {activeTab === 'wrong' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
             <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow border-l-8 border-[#d4af37]">
                <div>
                  <h2 className="text-2xl historical-title text-[#8b0000]">典藏 · 错题集</h2>
                  <p className="text-sm text-gray-500">反复研读，查漏补缺</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-[#8b0000]">{user.wrongQuestions.length}</span>
                  <span className="text-gray-400"> 道</span>
                </div>
             </div>

             <div className="space-y-6 pb-24 overflow-y-auto max-h-[calc(100vh-350px)] scrollbar-thin pr-2">
               {user.wrongQuestions.length > 0 ? (
                 user.wrongQuestions.map((q, idx) => (
                   <div key={q.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative group transition hover:shadow-md mb-6">
                     <button 
                        onClick={() => clearWrongQuestion(q.id)}
                        className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors"
                        title="移出题库"
                     >
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                     </button>
                     
                     <div className="flex items-start mb-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold mr-3 mt-1 shadow-sm ${q.type === 'choice' ? 'bg-[#8b0000] text-white' : 'bg-[#d4af37] text-black'}`}>
                          {q.type === 'choice' ? '单选' : '史料'}
                        </span>
                        <div className="flex-grow pr-8">
                          {q.material && (
                            <div className="bg-gray-50 p-4 rounded italic text-sm mb-4 border-l-2 border-gray-300 text-gray-600 font-serif">
                              {q.material}
                            </div>
                          )}
                          <p className="text-lg font-bold text-[#2c1810] leading-snug">{idx + 1}. {q.stem}</p>
                        </div>
                     </div>

                     <div className="mt-6 p-5 rounded-xl bg-[#fdf6e3] border border-[#d4af37]/30 shadow-sm">
                        <div className="flex items-center mb-2">
                          <span className="font-bold text-[#8b0000] mr-2">【标准答案】</span>
                          <span className="bg-white px-3 py-1 rounded shadow-sm font-mono font-bold border border-[#8b0000]/10">{q.answer}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed font-serif"><span className="font-bold text-gray-500">深度解析：</span>{q.analysis}</p>
                     </div>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-20 bg-white/60 rounded-3xl border-2 border-dashed border-gray-300">
                   <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-green-500">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   </div>
                   <h3 className="text-xl font-bold text-gray-400">错题本空空如也，恭喜！</h3>
                   <p className="text-gray-400 text-sm mt-2">保持现在的复习节奏，期末统考必胜</p>
                 </div>
               )}
             </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="max-w-4xl mx-auto animate-fade-in">
             <div className="bg-white p-8 rounded-3xl shadow-xl border-t-8 border-[#d4af37] mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#d4af37]/5 rounded-full -mr-16 -mt-16"></div>
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h2 className="historical-title text-3xl text-[#8b0000]">广州南沙考情</h2>
                  <button onClick={() => {setLoading(true); searchGuangzhouExamTrends().then(data => {setTrends(data); setLoading(false);}).catch(() => setLoading(false))}} className="text-xs text-[#8b0000] hover:underline flex items-center bg-[#8b0000]/5 px-4 py-2 rounded-full font-bold">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    刷新考讯
                  </button>
                </div>
                {!trends ? (
                  <div className="text-center py-16">
                    <button 
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const data = await searchGuangzhouExamTrends();
                          setTrends(data);
                        } catch (err) {
                          console.error("Search failed", err);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="bg-[#2c1810] text-[#d4af37] px-10 py-4 rounded-full font-bold shadow-2xl hover:scale-105 transition active:scale-95"
                    >
                      点击同步最新考试动态
                    </button>
                  </div>
                ) : (
                  <div className="prose prose-stone max-w-none mb-10">
                     <div className="p-8 bg-[#fdfaf2] rounded-2xl border-2 border-dashed border-[#d4af37]/30 whitespace-pre-wrap text-[#2c1810] leading-loose shadow-inner font-serif">
                        {trends.text}
                     </div>
                  </div>
                )}
                
                {trends?.links && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trends.links.map((link, i) => (
                      <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="flex items-center p-4 bg-[#fdf6e3] rounded-xl hover:bg-[#f5e8c7] transition group border border-[#d4af37]/20 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-[#8b0000] text-white flex items-center justify-center font-bold mr-3 group-hover:rotate-12 transition shadow-md">{i+1}</div>
                        <span className="text-sm font-bold truncate text-[#2c1810] flex-grow">{link.title}</span>
                        <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition text-[#8b0000]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      </a>
                    ))}
                  </div>
                )}
             </div>
          </div>
        )}

        {activeTab === 'profile' && (
           <div className="max-w-2xl mx-auto bg-white p-12 rounded-3xl shadow-2xl border-b-8 border-[#8b0000] text-center animate-fade-in">
              <div className="w-28 h-28 bg-[#d4af37] rounded-full mx-auto flex items-center justify-center text-4xl text-black font-bold mb-6 shadow-xl border-4 border-white">
                {user.userName[0]}
              </div>
              <h3 className="text-3xl font-bold mb-2 text-[#2c1810]">{user.userName}</h3>
              <p className="text-[#8b0000] font-bold text-sm mb-10 tracking-widest bg-[#8b0000]/5 px-4 py-1 rounded-full w-fit mx-auto">南沙备考精英</p>
              
              <div className="grid grid-cols-3 gap-6 mb-12">
                 <div className="p-5 bg-[#fdfaf5] rounded-2xl border border-[#d4af37]/20 shadow-sm">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">攻克单元</p>
                    <p className="text-3xl font-bold text-[#8b0000]">{user.completedLessons.length}</p>
                 </div>
                 <div className="p-5 bg-[#fdfaf5] rounded-2xl border border-[#d4af37]/20 shadow-sm">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">模拟均分</p>
                    <p className="text-3xl font-bold text-[#8b0000]">
                      {(() => {
                        const scores = Object.values(user.quizScores);
                        if (scores.length === 0) return 0;
                        const sum = (scores as number[]).reduce((acc: number, val: number) => acc + (val || 0), 0);
                        return Math.round(sum / scores.length);
                      })()}%
                    </p>
                 </div>
                 <div className="p-5 bg-[#fdfaf5] rounded-2xl border border-[#d4af37]/20 shadow-sm">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">待理错题</p>
                    <p className="text-3xl font-bold text-[#8b0000]">{user.wrongQuestions.length}</p>
                 </div>
              </div>

              <div className="text-left bg-[#fcfcfc] p-8 rounded-2xl shadow-inner border border-gray-100 max-h-72 overflow-y-auto scrollbar-thin">
                <h4 className="font-bold mb-6 border-b border-gray-200 pb-3 text-sm text-gray-400 flex justify-between items-center">
                  <span>单元战绩榜</span>
                  <span className="text-[10px]">最高纪录</span>
                </h4>
                {LESSONS.map(l => (
                  <div key={l.id} className="flex justify-between py-3 border-b border-dashed border-gray-200 last:border-0 group">
                    <span className="text-sm font-medium group-hover:text-[#8b0000] transition">{l.title}</span>
                    <span className={`font-mono font-bold ${user.quizScores[l.id] >= 90 ? 'text-green-600' : 'text-[#d4af37]'}`}>
                      {user.quizScores[l.id] || 0}%
                    </span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => { localStorage.removeItem('history_user'); window.location.reload(); }}
                className="mt-14 text-gray-400 hover:text-red-600 transition text-xs flex items-center justify-center mx-auto opacity-50 hover:opacity-100"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                登出并清除所有练习记录
              </button>
           </div>
        )}
      </main>

      <footer className="bg-[#2c1810] text-[#fdf6e3]/30 p-10 text-center text-xs">
         <p className="mb-3">高一历史期末复习助手 · 南沙统考专用版</p>
         <div className="flex justify-center space-x-6 mt-4">
           <span className="border-r border-white/10 pr-6">AI专家题库</span>
           <span className="border-r border-white/10 pr-6">毫秒级极速响应</span>
           <span>真题逻辑对齐</span>
         </div>
         <p className="mt-8 opacity-20 italic">“究天人之际，通古今之变，成一家之言。”</p>
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #d4af37; border-radius: 10px; }
        ::selection { background: #d4af37; color: black; }
        
        @media (max-width: 768px) {
          .historical-title { font-size: 1.5rem !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
