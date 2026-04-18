export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString();
};

export const calculateUrgency = (endDate: string): number => {
  const diff = new Date(endDate).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const getDDay = (deadline?: string | null): string => {
  if (!deadline) return '상시';
  const days = calculateUrgency(deadline);
  if (days === 0) return 'D-Day';
  if (days < 0) return '마감';
  return `D-${days}`;
};

export const isDeadlineSoon = (deadline?: string | null): boolean => {
  if (!deadline) return false;
  const days = calculateUrgency(deadline);
  return days >= 0 && days <= 3;
};
