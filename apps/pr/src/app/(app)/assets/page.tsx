"use client";

import {
  Image as ImageIcon,
  Clapperboard,
  Archive,
  Camera,
  Shapes,
  Eye,
  Share2,
  Download,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAssets, formatDate } from "@/lib/mock";
import type { AssetType } from "@/types";

const TYPE_ICON: Record<AssetType, LucideIcon> = {
  Poster: ImageIcon,
  Trailer: Clapperboard,
  EPK: Archive,
  Stills: Camera,
  Logo: Shapes,
};

export default function AssetsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
        Asset Vault
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Always the right version
      </h1>
      <p className="mt-1 text-sm text-muted">
        Everything the press, partners, and street team will ever ask for.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {getAssets().map((asset) => {
          const Icon = TYPE_ICON[asset.type];
          return (
            <Card key={asset.id} className="flex flex-col p-5">
              <div className="flex h-24 items-center justify-center rounded-lg bg-raised">
                <Icon className="h-7 w-7 text-faint" strokeWidth={1.25} />
              </div>
              <p className="mt-4 text-sm font-medium">{asset.name}</p>
              <p className="mt-0.5 text-xs text-faint">
                {asset.type} · {asset.format} · updated {formatDate(asset.updated)}
              </p>
              <div className="mt-4 flex gap-1.5">
                <Button variant="ghost" size="sm" aria-label={`Preview ${asset.name}`}>
                  <Eye className="h-3.5 w-3.5" strokeWidth={1.5} /> Preview
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Share ${asset.name}`}>
                  <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Share
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Download ${asset.name}`}>
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
