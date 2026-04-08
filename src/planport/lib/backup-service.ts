
import { Firestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

/**
 * Exports the entire application data structure into a portable JSON object.
 */
export async function exportAppData(db: Firestore) {
  const backup: any = {
    adminRoles: [],
    generalContractors: [],
    exportedAt: new Date().toISOString(),
    version: "1.0"
  };

  // 1. Export Admin Roles
  const adminSnapshot = await getDocs(collection(db, 'adminRoles'));
  backup.adminRoles = adminSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  // 2. Export GCs and their nested subcollections (Hierarchical Crawl)
  const gcSnapshot = await getDocs(collection(db, 'generalContractors'));
  for (const gcDoc of gcSnapshot.docs) {
    const gcId = gcDoc.id;
    const gcData = gcDoc.data();
    
    const projects: any[] = [];
    const projectsSnapshot = await getDocs(collection(db, 'generalContractors', gcId, 'projects'));
    
    for (const projectDoc of projectsSnapshot.docs) {
      const projectId = projectDoc.id;
      const projectData = projectDoc.data();
      
      const blueprintsSnapshot = await getDocs(collection(db, 'generalContractors', gcId, 'projects', projectId, 'blueprints'));
      const renderingsSnapshot = await getDocs(collection(db, 'generalContractors', gcId, 'projects', projectId, 'renderings'));
      const chiefFilesSnapshot = await getDocs(collection(db, 'generalContractors', gcId, 'projects', projectId, 'chiefFiles'));
      
      projects.push({
        id: projectId,
        data: projectData,
        blueprints: blueprintsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
        renderings: renderingsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
        chiefFiles: chiefFilesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      });
    }

    backup.generalContractors.push({
      id: gcId,
      data: gcData,
      projects
    });
  }

  return backup;
}

/**
 * Imports a JSON backup object back into Firestore.
 */
export async function importAppData(db: Firestore, backup: any) {
  // Import Admin Roles
  if (backup.adminRoles) {
    for (const role of backup.adminRoles) {
      const { id, ...data } = role;
      await setDoc(doc(db, 'adminRoles', id), data);
    }
  }

  // Import General Contractors and nested data
  if (backup.generalContractors) {
    for (const gc of backup.generalContractors) {
      const gcId = gc.id;
      await setDoc(doc(db, 'generalContractors', gcId), gc.data);
      
      if (gc.projects) {
        for (const project of gc.projects) {
          const projectId = project.id;
          await setDoc(doc(db, 'generalContractors', gcId, 'projects', projectId), project.data);
          
          if (project.blueprints) {
            for (const bp of project.blueprints) {
              const { id, ...data } = bp;
              await setDoc(doc(db, 'generalContractors', gcId, 'projects', projectId, 'blueprints', id), data);
            }
          }
          if (project.renderings) {
            for (const rend of project.renderings) {
              const { id, ...data } = rend;
              await setDoc(doc(db, 'generalContractors', gcId, 'projects', projectId, 'renderings', id), data);
            }
          }
          if (project.chiefFiles) {
            for (const file of project.chiefFiles) {
              const { id, ...data } = file;
              await setDoc(doc(db, 'generalContractors', gcId, 'projects', projectId, 'chiefFiles', id), data);
            }
          }
        }
      }
    }
  }
}
