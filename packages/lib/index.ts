export const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString();
};

export const calculateUrgency = (endDate: string) => {
  const diff = new Date(endDate).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
