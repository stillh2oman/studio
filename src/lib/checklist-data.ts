
export interface ChecklistCategory {
  id: string;
  label: string;
  description: string;
  subTasks: { id: string; label: string }[];
}

export const DEFAULT_CHECKLIST: ChecklistCategory[] = [
  { 
    id: 'titlePage', 
    label: 'Title Page', 
    description: 'Cover sheet, index, and general project information.',
    subTasks: [
      { id: 'updateNameAddress', label: 'Update Name and address on Title Page and Title Block.' },
      { id: 'scaleCheck', label: 'Ensure all items fit on pages when scaled to ¼”= 1’-0”.' },
      { id: 'indexCheck', label: 'Ensure Index has all pages listed and unused deleted.' },
      { id: 'areaCalculations', label: 'Update all Area Calculations; verify manual vs automated.' },
      { id: 'templateCheck', label: 'Verify correct Template (ZHR, McGregor, etc.).' },
    ]
  },
  { 
    id: 'plotPlan', 
    label: 'Plot Plan', 
    description: 'Site layout, setbacks, and utilities mapping.',
    subTasks: [
      { id: 'scaleLarge', label: 'Scale as large as possible (5’ increments).' },
      { id: 'levelLayerCheck', label: 'Plot Plan on Attic Level; correct CAD layers.' },
      { id: 'propertyLineDetails', label: 'Show lengths, orientations, setbacks, and easements.' },
      { id: 'vicinityMap', label: 'Add vicinity map from Snazzy with red dot site indicator.' },
      { id: 'northArrow', label: 'Verify North Arrow orientation.' },
      { id: 'newSidewalks', label: 'Show new sidewalks with width (if required).' },
      { id: 'drivewaySpecs', label: 'Show driveway widths, radii, and slopes (max 15%).' },
      { id: 'utilityLocations', label: 'Show water meter and electric meter locations.' },
      { id: 'acUnitLocations', label: 'Show A/C Unit locations (not in easement).' },
      { id: 'roofEavesSetback', label: 'Check roof eaves in setback (max 24”).' },
      { id: 'dimensionVeneer', label: 'Dimension from property lines to veneer on four sides.' },
      { id: 'lotCoverage', label: 'Show lot coverage area and percentage.' },
      { id: 'imperviousSurface', label: 'Show impervious surface calcs for in-fill lots.' },
      { id: 'floodPlain', label: 'Show flood plain if applicable.' }
    ]
  },
  { 
    id: 'foundationPlan', 
    label: 'Foundation Plan', 
    description: 'Structural slab or crawlspace design.',
    subTasks: [
      { id: 'verifyPerimeter', label: 'Verify measurements match 1st floor exactly.' },
      { id: 'columnFootings', label: 'Show 24”X24” column footings per engineer.' },
      { id: 'kitchenIslands', label: 'Show floor outlets and hatched areas for islands.' },
      { id: 'omitAnchorBolts', label: 'Hatch “Omit Anchor Bolts” for door openings.' },
      { id: 'bearingWallFooters', label: 'Add footers under bearing walls (centered).' },
      { id: 'plumbingFixtures', label: 'Show plumbing fixtures and drains on correct detail layer.' },
      { id: 'doubleCheckWalls', label: 'Final verification of foundation/wall alignment.' },
      { id: 'gasAppliances', label: 'Include gas appliances with dimensions (e.g. range).' },
      { id: 'slabRoomType', label: 'Set room type to Unspecified for sq ft calcs.' },
      { id: 'foundationNotes', label: 'Verify foundation notes, slopes, and engineering disclaimers.' }
    ]
  },
  { 
    id: 'floorPlans', 
    label: 'Floor Plans', 
    description: 'Detailed dimensions and room layouts.',
    subTasks: [
      { id: 'roomLabelsCeilings', label: 'Label rooms, verify ceiling heights and break lines.' },
      { id: 'dimensionCheck', label: 'Verify all interior/exterior dims; turn off +/- setting.' },
      { id: 'porchOverlay', label: 'Check porch floor levels, concrete fill, and -1” offsets.' },
      { id: 'vaultedTrayCeilings', label: 'Show vaults/trays; verify mechanical gaps.' },
      { id: 'columnLayers', label: 'Set columns to Wall Normal layer with dark gray fill.' },
      { id: 'plumbingDryerWalls', label: 'Ensure 6” walls behind all plumbing and dryers.' },
      { id: 'stairSpecs', label: 'Verify stair risers (max 7 ¾”) and treads (min 10-11”).' },
      { id: 'hoseBibs', label: 'Show bibs at wall intersections; 12” above floor.' },
      { id: 'planNotesSync', label: 'Remove unneeded notes; re-number note schedule.' },
      { id: 'ceilingPlaneMatch', label: 'Confirm 3D ceiling planes match slope labels.' },
      { id: 'secondFloorCleanup', label: 'Delete unused 2nd floor; roof on attic level.' },
      { id: 'porchSidewalkLayer', label: 'Turn on sidewalk layer for Layout and Electrical sets.' },
      { id: 'millworkBeams', label: 'Label all beams; verify millwork layer visibility.' },
      { id: 'applianceLabels', label: 'Label appliances with 3” font (Washer, Dryer, etc.).' },
      { id: 'furnitureLayer', label: 'Move table lamps to Furniture layer.' }
    ]
  },
  { 
    id: 'schedules', 
    label: 'Schedules', 
    description: 'Door, window, and cabinet specification tables.',
    subTasks: [
      { id: 'cabinetIntervals', label: 'Verify 3” intervals for cabinet widths.' },
      { id: 'doorIntervals', label: 'Verify 2” intervals; check 6’8” vs 8’ heights.' },
      { id: 'windowIntervals', label: 'Verify 2” intervals; mark egress; verify bottom heights.' },
      { id: 'renumberSchedules', label: 'Re-number all schedules; remove 2D elevations if visible.' },
      { id: 'atticWindowLabel', label: 'Add “ATTIC” manually to attic windows (3” font).' },
    ]
  },
  { 
    id: 'exteriorElevations', 
    label: 'Exterior Elevations', 
    description: 'Vertical views of all exterior sides.',
    subTasks: [
      { id: 'materialLabels', label: 'Use generic labeling (Lap Siding, Stone, etc.).' },
      { id: 'layoutCleanup', label: 'Edit Layout Lines to clean up stray lines.' },
      { id: 'gradeDisplay', label: 'Show correct site grades and slopes.' },
      { id: 'chimneyHeight', label: 'Verify chimney height meets code (2’ above roof).' },
      { id: 'storyPoleAccuracy', label: 'Check story pole elevations using glass house view.' },
      { id: 'fillPatternMatch', label: 'Match fill patterns to material (Stone, Brick).' },
      { id: 'beamTextureRotation', label: 'Rotate wood beam textures to match orientation.' }
    ]
  },
  { 
    id: 'roofPlan', 
    label: 'Roof Plan', 
    description: 'Geometry, drainage, and material callouts.',
    subTasks: [
      { id: 'renumberRoofSchedules', label: 'Re-number roof schedules sequentially.' },
      { id: 'guttersRidgeCaps', label: 'Show gutters and ridge caps.' },
      { id: 'footprintBelow', label: 'Show dashed footprint lines for main building/porches.' },
      { id: 'chimneySkylights', label: 'Show chimney crickets and skylights.' },
      { id: 'plateHeights', label: 'Label non-standard plate heights.' },
      { id: 'roofLabels', label: 'Show roof labels with slope arrows.' }
    ]
  },
  { 
    id: 'electricalPlan', 
    label: 'Electrical Plan', 
    description: 'Lighting, switching, and power distribution.',
    subTasks: [
      { id: 'applianceOutlets', label: 'Verify all appliance outlets are shown.' },
      { id: 'detectorPlacement', label: 'Verify smoke and CO detector placement.' },
      { id: 'outletSpacing', label: 'Check code spacing (48” kitchen, 12’ rest, 24” walls).' },
      { id: 'outdoorOutlets', label: 'Show porch/driveway outlets; HVAC/WH labels.' },
      { id: 'properLighting', label: 'Check porch/garage lighting; add eave outlets.' },
      { id: 'bathroomExhaust', label: 'Exhaust tied to shower lights where applicable.' },
      { id: 'cat6Outlets', label: 'Show CAT 6 outlets at all TV locations.' },
      { id: 'garbageDisposalSwitch', label: 'Verify disposal switch connection.' },
      { id: 'floorOutletsCoordination', label: 'Sync floor outlets with foundation plan.' }
    ]
  }
];
