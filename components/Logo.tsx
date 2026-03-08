import Image from 'next/image'

interface LogoProps {
  className?: string
}

export default function Logo({ className = 'h-8 w-8' }: LogoProps) {
  return (
    <Image
      alt="Kravhantering logotyp"
      className={className}
      height={32}
      src="/logo-small.png"
      width={32}
    />
  )
}
