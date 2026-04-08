
"use client"

import { use, useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDoc, useMemoFirebase, useFirestore, useUser, useCollection, updateDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { Project, ProjectChecklist, Client, ProjectNote, CHECKLIST_MAIN_KEYS } from '@/lib/types';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectNotes } from '@/components/projects/project-notes';
import { Loader2, ArrowLeft, CheckCircle2, Circle, Layout, MapPin, UserCircle, Save, Info, MessageSquare, ListTodo, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES: { 
  key: keyof ProjectChecklist; 
  label: string; 
  description: string;
  subTasks?: { key: string; label: string }[];
}[] = [
  { 
    key: 'titlePage', 
    label: 'Title Page', 
    description: 'Cover sheet, index, and general project information.',
    subTasks: [
      { key: 'updateNameAddress', label: 'Update Name and address on Title Page and Title Block. Make sure the Client Name is correct.' },
      { key: 'scaleCheck', label: 'Ensure all items fit on the pages when scaled to ¼”= 1’-0”. If not, place on an “E” sized .layout template.' },
      { key: 'indexCheck', label: 'Ensure Index has all the pages listed and pages not used have been deleted.' },
      { key: 'areaCalculations', label: 'Update all Area Calculations and ensure each room is properly labeled. Change all garages, porches and slab rooms on the foundation level to “Unspecified” so they are not counted twice in the Area Calculations. Do a manual calculation of the heated square footage to verify that number matches the automated number.' },
      { key: 'templateCheck', label: 'Make sure you are using the right Template if it is ZHR, McGregor, Oxbow, Fuller, Kerkhoff or Envision.' },
    ]
  },
  { 
    key: 'plotPlan', 
    label: 'Plot Plan', 
    description: 'Site layout, setbacks, and utilities mapping.',
    subTasks: [
      { key: 'scaleLarge', label: 'Scale as large as possible and make sure the scale matches the scale label. (5’ increments).' },
      { key: 'levelLayerCheck', label: 'Make sure the Plot Plan is on the Attic Level and not on the 1st floor level. Make sure all CAD lines are in the CAD – Plot Plan layer.' },
      { key: 'propertyLineDetails', label: 'Show lengths of each property line making sure the text height is big enough when sent to layout to be seen easily. Add property line orientation label (if known) using the format (N 67° 54’ 23” E). Don’t rely on automatic labels! Show Property Lines, Setback Lines, Utility Easements, Building Footprint (to veneer) and rooflines. Show sidewalks, retaining walls, porches and pools. Show the adjacent roads and label each road. Verify the road location with aerial photos.' },
      { key: 'vicinityMap', label: 'Add vicinity map from Snazzy and place red dot over the building site.' },
      { key: 'northArrow', label: 'Make sure the North Arrow is correctly oriented for both the plot plan and the area map.' },
      { key: 'newSidewalks', label: 'Show new sidewalks with width (if required).' },
      { key: 'drivewaySpecs', label: 'Show driveway widths at curb and at the property line. Show return radii of 60” minimum at curb. Show 60” min. apron sloping up to curb height (min.). Note the driveway may not exceed a 15% slope.' },
      { key: 'utilityLocations', label: 'Show water meter and electric meter locations.' },
      { key: 'acUnitLocations', label: 'Show A/C Unit locations (May be in the setback, but not the easement).' },
      { key: 'roofEavesSetback', label: 'Roof eaves may be in the setback (up to 24”, but not in the easement).' },
      { key: 'dimensionVeneer', label: 'Dimension from property lines to veneer on all four sides. If lot is not rectangular, use the radius dimension method.' },
      { key: 'lotCoverage', label: 'Show lot coverage area and percentage of coverage (Footprint of the house).' },
      { key: 'imperviousSurface', label: 'If an in-fill lot, show impervious surface calculations and percentage.' },
      { key: 'floodPlain', label: 'Show flood plain if applicable.' }
    ]
  },
  { 
    key: 'foundationPlan', 
    label: 'Foundation Plan', 
    description: 'Structural slab or crawlspace design.',
    subTasks: [
      { key: 'verifyPerimeter', label: 'Verify each measurement around the perimeter is the exact same as the 1st floor. Use the reference layer to help verify all walls line up. Keep in mind if you line up a foundation wall with an invisible wall above (like on a porch), it will typically be a ½ off, so you must manually adjust.' },
      { key: 'columnFootings', label: 'Show column footings 24”X24” under each column with note “Column footing per engineer’s specs”.' },
      { key: 'kitchenIslands', label: 'Show floor outlets and a hatched area for kitchen islands so they know to run electrical conduit to those locations.' },
      { key: 'omitAnchorBolts', label: 'Show hatched area with “Omit Anchor Bolts” for all doors and opening above the footers.' },
      { key: 'bearingWallFooters', label: 'Add footers under bearing walls (centered). This especially applies in living room areas where you have vaulted ceilings.' },
      { key: 'plumbingFixtures', label: 'Show all plumbing fixtures and drains and make sure they are on the CAD – Foundation Detail layer with the cabinet schedules and labels turned off so they don’t show up twice in the schedules. Dishwashers do not need to be shown since they drain through the sink.' },
      { key: 'doubleCheckWalls', label: 'Go back and verify the walls line up with the 1st floor again just to make sure. This is critically important.' },
      { key: 'gasAppliances', label: 'Make sure to include gas appliances on the foundation plan with dimensions (i.e. gas range).' },
      { key: 'slabRoomType', label: 'On slab foundations, make sure each “room type” is changed to Unspecified so that the square footage is not added to the area calculation total.' },
      { key: 'foundationNotes', label: 'Make sure all of the foundation notes are added for porch and garage floor slopes, omit anchor bolts, 1/2” expansion joints, and engineering disclaimer note.' }
    ]
  },
  { 
    key: 'floorPlans', 
    label: 'Floor Plans', 
    description: 'Detailed dimensions and room layouts.',
    subTasks: [
      { key: 'roomLabelsCeilings', label: 'Make sure all rooms are properly labeled and verify the ceiling heights. Turn on the Ceiling Break lines Layer and verify there is not any clipping that was unintentional. Go through the model in a camera view and look at the ceiling heights to verify there are no ceiling height issues. Ensure the flooring labels match what is in the model.' },
      { key: 'dimensionCheck', label: 'Verify all interior and exterior dimensions are correct and you have turned off the +/- setting after fixing any issues that caused the +/-. Try to get all walls to an even each or ½” dimension.' },
      { key: 'porchOverlay', label: 'Make sure all porches have sidewalk overlay, and the fill is changed to 4” concrete with light gray. If you don’t change the overlay to a sidewalk, grass will show through it. Make sure all porch floor levels and foundation tops are set to -1”. Turn off the invisible wall layer.' },
      { key: 'vaultedTrayCeilings', label: 'Make sure all vaulted ceilings and tray ceilings are shown in the plan and very in camera view that there are not unwanted ceiling clips. Make sure the slopes are labeled. Ensure there is still a pathway from mechanicals from one side of the building to the other, even if this means lowering the ceiling slope so there is a gap between the ceiling and the roof. Make sure the label show the plate height (not the ceiling height).' },
      { key: 'columnLayers', label: 'Make sure all columns are changed to the Wall, Normal Layer and are filled with dark gray.' },
      { key: 'plumbingDryerWalls', label: 'Ensure we have 6” walls behind all plumbing and dryers. We need a 6” wall behind each dryer, even on an exterior wall, for venting. Label 6” walls with white letters inside the wall.' },
      { key: 'stairSpecs', label: 'Verify all stairs have risers of no more than 7 ¾” and treads of less than 11”. We can go to 10”, but only if necessary for the stairs to fit.' },
      { key: 'hoseBibs', label: 'Show hose bibs. All hose bibs should be at a wall intersection so that the bid can go into the insulated wall 18” to prevent pipes freezing. make sure they are about 12” above floor level.' },
      { key: 'planNotesSync', label: 'Verify all Plan Notes are accurate, all unneeded notes are removed, and the Plan Notes Schedule is re-numbered. Verify each measurement around the perimeter is the exact same as the 1st floor. Use the reference layer to help verify all walls line up. Keep in mind if you line up a foundation wall with an invisible wall above (like on a porch), it will typically be a ½ off, so you must manually adjust.' },
      { key: 'ceilingPlaneMatch', label: 'Confirm in 3D that the ceiling planes match the ceiling plane slope label.' },
      { key: 'secondFloorCleanup', label: 'If no 2nd floor, delete that floor. The roof will always be on the attic level.' },
      { key: 'porchSidewalkLayer', label: 'On all porches, create a sidewalk that covered the entire porch area, and change the fill to concrete, 4” with light gray color. This will keep the grass from showing through. Make sure the sidewalk layer is turned on for the Layout Layer Set and the Electrical Layer Set.' },
      { key: 'millworkBeams', label: 'Make sure that the millwork layer is turned on and all beams are labeled.' },
      { key: 'applianceLabels', label: 'Ensure all appliances (Washer, Dryer, Dishwasher, Microwave, etc.) are labeled with a 3” font.' },
      { key: 'furnitureLayer', label: 'Make sure all furniture is on the Furniture layer (including table lamps) so that they show in the electrical plan but NOT the floor plan.' }
    ]
  },
  { 
    key: 'schedules', 
    label: 'Schedules', 
    description: 'Door, window, and cabinet specification tables.',
    subTasks: [
      { key: 'cabinetIntervals', label: 'Make sure all cabinets are in 3” intervals for width.' },
      { key: 'doorIntervals', label: 'Make sure all doors are in 2” intervals for width. 6’8” doors on 9’ or less wall heights and 8’ doors on wall heights above 10’ or more unless specified.' },
      { key: 'windowIntervals', label: 'Make sure all windows are in 2” intervals. Mark all egress windows. Ensure the window type is properly labeled, and the bottom heights are accurate and verified in camera view.' },
      { key: 'renumberSchedules', label: 'Re-number all schedules to make sure there are no skipped numbers. Remove the 2d elevations (if visible) for the cabinets, windows and doors.' },
      { key: 'atticWindowLabel', label: 'If a window is an attic window, add the text “ATTIC” manually with 3” letters and no background.' },
    ]
  },
  { 
    key: 'exteriorElevations', 
    label: 'Exterior Elevations', 
    description: 'Vertical views of all exterior sides.',
    subTasks: [
      { key: 'materialLabels', label: 'Make sure all materials are properly labeled. Just use generic labeling like “Lap Siding”, “Board & Batt Siding” etc. instead of LP Siding or Fiber Cement Siding.' },
      { key: 'layoutCleanup', label: 'Refresh the views in layout, then clean up any stray lines using the Edit Layout Lines tool.' },
      { key: 'gradeDisplay', label: 'Ensure the grade is shown property including any slopes to the site.' },
      { key: 'chimneyHeight', label: 'Verify the chimney height is to code. The top must be 2’ above a 10’ line drawn to the nearest roofline or structure.' },
      { key: 'storyPoleAccuracy', label: 'Ensure all story pole elevations are accurate. Use the glass house view to verify.' },
      { key: 'fillPatternMatch', label: 'Make sure the fill pattern matches the material (i.e. stone, brick, siding).' },
      { key: 'beamTextureRotation', label: 'When doing a wood beam, make sure the texture is rotated properly to match the orientation of the beam.' }
    ]
  },
  { key: 'interiorElevations', label: 'Interior Elevations', description: 'Vertical views of kitchen, bath, and custom millwork.' },
  { 
    key: 'roofPlan', 
    label: 'Roof Plan', 
    description: 'Geometry, drainage, and material callouts.',
    subTasks: [
      { key: 'renumberRoofSchedules', label: 'Re-number all schedules to make sure there are no skipped numbers.' },
      { key: 'guttersRidgeCaps', label: 'Show gutters and ridge caps.' },
      { key: 'footprintBelow', label: 'Show black dashed line for footprint below of the main building with gray dashed lines for the porches. Show both floors (if applicable).' },
      { key: 'chimneySkylights', label: 'Show chimney with crickets. Show skylights.' },
      { key: 'plateHeights', label: 'Label plate heights if different from standard.' },
      { key: 'roofLabels', label: 'Show roof labels with arrow point towards the low side of the slope.' }
    ]
  },
  { 
    key: 'electricalPlan', 
    label: 'Electrical Plan', 
    description: 'Lighting, switching, and power distribution.',
    subTasks: [
      { key: 'applianceOutlets', label: 'Make sure all appliance outlets are shown.' },
      { key: 'detectorPlacement', label: 'Verify placement of all smoke detectors and CO detectors.' },
      { key: 'outletSpacing', label: 'Ensure outlets in each room are not further away from each other per code. In the kitchen they must be no further than 48” apart. In the rest of the house, no more than 12’ apart. Any wall that is more than 24” wide, must have an outlet. GFCI outlets in the bathrooms, garages and within 36” of a sink or other water fixture.' },
      { key: 'outdoorOutlets', label: 'Outdoor outlets on all porches and near the driveway. Label HVAC and Water Heater “Provide Electrical per Manufacturer’s Specs.”' },
      { key: 'properLighting', label: 'Make sure you have proper lighting the porches and outside of the garage. Add eave outlets at all corners.' },
      { key: 'bathroomExhaust', label: 'Exhaust in all bathrooms tied to the shower light (if applicable).' },
      { key: 'cat6Outlets', label: 'Show CAT 6 outlets for all TV locations.' },
      { key: 'garbageDisposalSwitch', label: 'Make sure you have a switch connected to the garbage disposal.' },
      { key: 'floorOutletsCoordination', label: 'Add floor outlets where appropriate and make sure they are copied down to the foundation plan.' }
    ]
  },
  { key: 'asBuiltPlans', label: 'As-Built Plans', description: 'Verification of existing conditions for remodels.' },
];

export default function ProjectChecklistPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ 
    titlePage: true, 
    plotPlan: true, 
    foundationPlan: true,
    floorPlans: true,
    schedules: true,
    exteriorElevations: true,
    roofPlan: true,
    electricalPlan: true
  });

  useEffect(() => {
    const saved = localStorage.getItem('di_ledger_session_employee_id');
    if (saved) setSessionEmployeeId(saved);
  }, []);

  // LIGHTWEIGHT DATA FETCHING: Resolve root ID first
  const employeeRef = useMemoFirebase(() => 
    sessionEmployeeId ? doc(firestore, 'employees', sessionEmployeeId) : null
  , [firestore, sessionEmployeeId]);
  
  const { data: myEmployee } = useDoc<any>(employeeRef);

  const dataRootId = useMemo(() => {
    if (!sessionEmployeeId) return null;
    return myEmployee?.bossId || sessionEmployeeId;
  }, [sessionEmployeeId, myEmployee]);

  // Project data fetch
  const projectRef = useMemoFirebase(() => 
    dataRootId ? doc(firestore, 'employees', dataRootId, 'projects', projectId) : null
  , [firestore, dataRootId, projectId]);

  const { data: project, isLoading: isProjectLoading } = useDoc<Project>(projectRef);

  // Client data fetch
  const clientRef = useMemoFirebase(() => 
    (dataRootId && project?.clientId) ? doc(firestore, 'employees', dataRootId, 'clients', project.clientId) : null
  , [firestore, dataRootId, project?.clientId]);

  const { data: client } = useDoc<Client>(clientRef);

  // Notes data fetch
  const notesQuery = useMemoFirebase(() => 
    dataRootId ? query(collection(firestore, 'employees', dataRootId, 'projects', projectId, 'notes'), orderBy('createdAt', 'desc')) : null
  , [firestore, dataRootId, projectId]);

  const { data: notes } = useCollection<ProjectNote>(notesQuery);

  // Lightweight mutations (No hook dependency)
  const addProjectNote = async (pId: string, n: any) => {
    if (!dataRootId) return;
    const noteId = doc(collection(firestore, 'employees', dataRootId, 'projects', pId, 'notes')).id;
    setDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', pId, 'notes', noteId), { 
      ...n, 
      id: noteId, 
      authorId: sessionEmployeeId || 'system', 
      authorName: n.authorName || `${myEmployee?.firstName} ${myEmployee?.lastName}`, 
      createdAt: new Date().toISOString() 
    }, { merge: true });
  };

  const updateProjectNote = async (pId: string, nId: string, u: Partial<ProjectNote>) => {
    if (!dataRootId) return;
    updateDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', pId, 'notes', nId), u);
  };

  const deleteProjectNote = async (pId: string, nId: string) => {
    if (!dataRootId) return;
    deleteDocumentNonBlocking(doc(firestore, 'employees', dataRootId, 'projects', pId, 'notes', nId));
  };

  const handleToggleItem = (itemKey: keyof ProjectChecklist) => {
    if (!project || !projectRef) return;

    const currentChecklist = project.checklist || {
      titlePage: false, plotPlan: false, foundationPlan: false, floorPlans: false,
      schedules: false, exteriorElevations: false, interiorElevations: false,
      roofPlan: false, electricalPlan: false, asBuiltPlans: false
    };

    const newChecklist = {
      ...currentChecklist,
      [itemKey]: !currentChecklist[itemKey]
    };

    updateDocumentNonBlocking(projectRef, { checklist: newChecklist });
    toast({
      title: "Checklist Updated",
      description: `Set "${CATEGORIES.find(c => c.key === itemKey)?.label}" to ${!currentChecklist[itemKey] ? 'Completed' : 'Pending'}.`,
    });
  };

  const handleToggleSubTask = (catKey: string, subKey: string) => {
    if (!project || !projectRef) return;

    const currentChecklist = project.checklist || {
      titlePage: false, plotPlan: false, foundationPlan: false, floorPlans: false,
      schedules: false, exteriorElevations: false, interiorElevations: false,
      roofPlan: false, electricalPlan: false, asBuiltPlans: false
    };

    const subTasksKey = `${catKey}SubTasks`;
    const currentSubTasks = (currentChecklist as any)[subTasksKey] || {};
    
    const newSubTasks = {
      ...currentSubTasks,
      [subKey]: !currentSubTasks[subKey]
    };

    const newChecklist = {
      ...currentChecklist,
      [subTasksKey]: newSubTasks
    };

    updateDocumentNonBlocking(projectRef, { checklist: newChecklist });
  };

  const toggleExpand = (key: string) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isProjectLoading || !dataRootId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <h2 className="text-2xl font-headline font-bold text-rose-500 mb-4">Project Not Found</h2>
        <Button onClick={() => router.push('/')} variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Return to Dashboard</Button>
      </div>
    );
  }

  const checklistCount = project.checklist ? CHECKLIST_MAIN_KEYS.filter(k => project.checklist![k] === true).length : 0;
  const progressValue = (checklistCount / 10) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-headline font-bold text-white flex items-center gap-2">
                <Layout className="h-5 w-5 text-primary" /> {project.name}
              </h1>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Project Details Command</p>
                <div className="h-1 w-1 rounded-full bg-border" />
                <p className="text-[10px] text-accent font-bold uppercase tracking-widest">{client?.name || 'Loading Client...'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
              {project.status || 'Active'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <Tabs defaultValue="checklist" className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-card/50 border border-border/50 p-1 rounded-2xl h-14 w-fit shadow-lg">
              <TabsTrigger value="checklist" className="px-8 h-11 rounded-xl gap-2"><ListTodo className="h-4 w-4" /> Architectural Checklist</TabsTrigger>
              <TabsTrigger value="notes" className="px-8 h-11 rounded-xl gap-2"><MessageSquare className="h-4 w-4" /> Project Notes</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="checklist" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Card className="border-border/50 shadow-2xl overflow-hidden bg-card/50">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-accent" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-headline font-bold text-white">Plan Set Progress</h2>
                        <p className="text-sm text-muted-foreground">Detailed category tracking for full construction sets.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span className="text-muted-foreground">Overall Completion</span>
                        <span className="text-accent">{checklistCount} / 10 Documents</span>
                      </div>
                      <Progress value={progressValue} className="h-3 bg-muted border border-border/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <UserCircle className="h-3 w-3" /> Client
                      </span>
                      <p className="text-sm font-bold text-white truncate">{client?.name || 'Assigned'}</p>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Site Location
                      </span>
                      <p className="text-sm font-bold text-white truncate">{project.address || 'Not Listed'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {CATEGORIES.map((cat) => {
                    const isDone = project.checklist?.[cat.key] === true;
                    const isExpanded = expandedCats[cat.key];
                    const hasSubTasks = cat.subTasks && cat.subTasks.length > 0;
                    const subTasksData = (project.checklist as any)?.[`${cat.key}SubTasks`] || {};

                    return (
                      <div key={cat.key} className="space-y-2">
                        <div 
                          className={cn(
                            "flex items-center gap-6 p-6 rounded-2xl border transition-all group",
                            isDone 
                              ? "bg-emerald-500/5 border-emerald-500/20" 
                              : "bg-background/50 border-border/50 hover:border-primary/30"
                          )}
                        >
                          <Checkbox 
                            id={`check-${cat.key}`}
                            checked={isDone}
                            onCheckedChange={() => handleToggleItem(cat.key)}
                            className="h-6 w-6 rounded-md"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Label 
                                htmlFor={`check-${cat.key}`}
                                className={cn(
                                  "text-lg font-bold cursor-pointer transition-colors block",
                                  isDone ? "text-emerald-500 line-through" : "text-white"
                                )}
                              >
                                {cat.label}
                              </Label>
                              {hasSubTasks && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleExpand(cat.key)}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                              {cat.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isDone ? (
                              <Badge className="bg-emerald-500 text-white border-none text-[10px] uppercase font-bold">Ready</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] uppercase font-bold opacity-50 group-hover:opacity-100">In Queue</Badge>
                            )}
                          </div>
                        </div>

                        {hasSubTasks && isExpanded && (
                          <div className="ml-12 pl-6 border-l-2 border-primary/20 space-y-3 py-2 animate-in slide-in-from-top-2 duration-300">
                            {cat.subTasks?.map((sub) => {
                              const subIsDone = subTasksData[sub.key] === true;
                              return (
                                <div key={sub.key} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                                  <Checkbox 
                                    id={`sub-${cat.key}-${sub.key}`}
                                    checked={subIsDone}
                                    onCheckedChange={() => handleToggleSubTask(cat.key, sub.key)}
                                    className="h-4 w-4 mt-0.5"
                                  />
                                  <Label 
                                    htmlFor={`sub-${cat.key}-${sub.key}`}
                                    className={cn(
                                      "text-xs font-medium leading-relaxed cursor-pointer",
                                      subIsDone ? "text-emerald-500/70 line-through" : "text-muted-foreground"
                                    )}
                                  >
                                    {sub.label}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <ProjectNotes 
              projectId={projectId} 
              notes={notes || []} 
              onAddNote={(note) => addProjectNote(projectId, note)}
              onUpdateNote={(noteId, note) => updateProjectNote(projectId, noteId, note)}
              onDeleteNote={(noteId) => deleteProjectNote(projectId, noteId)}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
