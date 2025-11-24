import api from './api';

export const uploadService = {
  uploadFile: async (file: File, lessonId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (lessonId) {
      formData.append('lessonId', lessonId);
    }

    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  deleteFile: async (id: string) => {
    await api.delete(`/upload/${id}`);
  },
};
