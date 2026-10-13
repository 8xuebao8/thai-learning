import { it, expect } from 'vitest';
import { wordSchema } from './model';
import { courseWords } from '../content/course';
it('accepts raw Thai as pending but rejects incomplete learning-ready entries',()=>{
 const raw={...courseWords[0],roman:'',chinese:'',enrichment:'pending'};
 expect(wordSchema.safeParse(raw).success).toBe(true);
 expect(wordSchema.safeParse({...raw,enrichment:'ready'}).success).toBe(false);
});
