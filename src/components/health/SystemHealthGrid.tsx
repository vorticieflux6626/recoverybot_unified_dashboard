import { useQuery } from '@tanstack/react-query'
import { fetchHealthAggregate } from '@/lib/api'
import { useDashboardStore } from '@/stores/dashboardStore'
import { ServiceHealthCard } from './ServiceHealthCard'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export function SystemHealthGrid() {
  const { services, setServices } = useDashboardStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealthAggregate,
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (data) {
      setServices(data)
    }
  }, [data, setServices])

  if (isLoading && services.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && services.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-8">
        <p>Unable to fetch service health</p>
        <p className="text-sm mt-2">Backend may be offline</p>
      </div>
    )
  }

  const displayServices = data || services

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {displayServices.map((service) => (
        <ServiceHealthCard key={service.name} service={service} />
      ))}
    </div>
  )
}
