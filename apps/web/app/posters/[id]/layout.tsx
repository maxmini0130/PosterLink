interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default function PosterDetailLayout({ children }: Props) {
  return <>{children}</>;
}
