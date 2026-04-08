
"use client"

import { useState, useMemo } from 'react';
import { SupplyItem, SupplyCategory } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingCart, Package, Plus, Trash2, User, Clock, Shield, CheckCircle2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle } from '@/components/ui/alert';

type SortConfig = { key: keyof SupplyItem; direction: 'asc' | 'desc' } | null;

interface SuppliesTabProps {
  supplies: SupplyItem[];
  onAddItem: (item: Omit<SupplyItem, 'id' | 'requestedBy' | 'createdAt'>) => void;
  onDeleteItem: (id: string) => void;
  canEdit?: boolean;
}

export function SuppliesTab({ supplies, onAddItem, onDeleteItem, canEdit = true }: SuppliesTabProps) {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<SupplyCategory>('Grocery');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !itemName.trim()) return;

    onAddItem({
      name: itemName.trim(),
      category
    });

    setItemName('');
  };

  const handlePurchased = (id: string) => {
    onDeleteItem(id);
  };

  const handleSort = (key: keyof SupplyItem) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: keyof SupplyItem }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const sortedSupplies = useMemo(() => {
    let items = [...supplies];
    if (sortConfig) {
      items.sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [supplies, sortConfig]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-xl font-headline flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Request New Item
              </CardTitle>
              <CardDescription>Add groceries or office supplies needed for the firm.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {!canEdit ? (
                <Alert className="bg-muted/30 border-dashed border-border/50 mb-4">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <AlertTitle className="text-xs">Read-Only Access</AlertTitle>
                </Alert>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-name">Item Name</Label>
                    <Input 
                      id="item-name" 
                      value={itemName} 
                      onChange={e => setItemName(e.target.value)} 
                      placeholder="e.g. Paper Towels, Coffee..." 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        type="button" 
                        variant={category === 'Grocery' ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setCategory('Grocery')}
                      >
                        <ShoppingCart className="h-4 w-4" /> Grocery
                      </Button>
                      <Button 
                        type="button" 
                        variant={category === 'Office Supply' ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setCategory('Office Supply')}
                      >
                        <Package className="h-4 w-4" /> Supply
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-4">
                    Submit Request
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="border-border/50 shadow-xl overflow-hidden bg-card/30">
            <CardHeader className="bg-muted/30 py-4">
              <CardTitle className="text-lg font-headline flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-accent" /> Firm Shopping List
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="w-12 text-center">Purchased</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('name')}>
                      <div className="flex items-center">Item <SortIcon column="name" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('requestedBy')}>
                      <div className="flex items-center">Requested By <SortIcon column="requestedBy" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('category')}>
                      <div className="flex items-center">Category <SortIcon column="category" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center justify-end">Date <SortIcon column="createdAt" /></div>
                    </TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSupplies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-32 text-muted-foreground italic">
                        No requests pending. All supplies are stocked!
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSupplies.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/10 transition-colors group">
                        <TableCell className="text-center">
                          <Checkbox 
                            id={`purchased-${item.id}`}
                            onCheckedChange={() => handlePurchased(item.id)}
                            disabled={!canEdit}
                            className="h-5 w-5"
                          />
                        </TableCell>
                        <TableCell className="font-bold text-white">
                          <Label htmlFor={`purchased-${item.id}`} className="cursor-pointer">{item.name}</Label>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <User className="h-3 w-3 text-primary" /> {item.requestedBy}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "text-[10px] uppercase font-bold",
                            item.category === 'Grocery' ? "border-emerald-500/30 text-emerald-500" : "border-sky-500/30 text-sky-500"
                          )}>
                            {item.category === 'Grocery' ? 'GROCERY' : 'OFFICE'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Clock className="h-2.5 w-2.5" /> {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onDeleteItem(item.id)}
                            disabled={!canEdit}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
