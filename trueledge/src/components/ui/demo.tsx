'use client'

import { SplineScene } from "@/components/ui/splite"
import { Card } from "@/components/ui/card"
import { Spotlight } from "@/components/ui/spotlight"

export function SplineSceneBasic() {
    return (
        <Card className="w-full min-h-[520px] bg-black/[0.55] backdrop-blur-md border-border/60 relative overflow-hidden">
            <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" />

            <div className="flex flex-col lg:flex-row h-full">
                {/* Left content */}
                <div className="flex-1 p-8 relative z-10 flex flex-col justify-center">
                    <h3 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                        Meet your 3D assistant
                    </h3>
                    <p className="mt-4 text-muted-foreground max-w-lg">
                        An interactive Spline robot embedded directly into your landing page.
                        Drag / zoom / interact to explore.
                    </p>
                </div>

                {/* Right content */}
                <div className="flex-1 relative min-h-[320px] lg:min-h-[520px]">
                    <SplineScene
                        scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                        className="w-full h-full"
                    />
                </div>
            </div>
        </Card>
    )
}